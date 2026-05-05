from typing import List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import func, select, and_
from fastapi import HTTPException, status

from ..models.test import Test
from ..schemas.test import (
    TestCreate,
    TestUpdate,
    TestListings,
    ListingsResponse,
    TestResponse,
)


class TestService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_test(self, test_data: TestCreate) -> Test:
        """Create a new test."""
        # Check if test with same work_package_name, test_name, and element_cms_id already exists
        stmt = select(Test).filter(
            Test.work_package_name == test_data.work_package_name,
            Test.test_name == test_data.test_name,
            Test.element_cms_id == test_data.element_cms_id,
        )
        result = await self.db.execute(stmt)
        existing_test = result.scalar_one_or_none()

        if existing_test:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    f"Test with name '{test_data.test_name}' for work package "
                    f"'{test_data.work_package_name}' and element "
                    f"'{test_data.element_cms_id}' already exists"
                ),
            )

        db_test = Test(**test_data.dict())
        self.db.add(db_test)
        await self.db.commit()
        await self.db.refresh(db_test)
        return db_test

    async def get_test_by_id(self, test_id: int) -> Optional[Test]:
        """Get a test by ID."""
        stmt = select(Test).filter(Test.id == test_id)
        result = await self.db.execute(stmt)
        test = result.scalar_one_or_none()

        if not test:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Test with ID {test_id} not found",
            )
        return test

    async def get_test_by_name(self, test_name: str) -> Optional[Test]:
        """Get a test by name."""
        stmt = select(Test).filter(Test.test_name == test_name)
        result = await self.db.execute(stmt)
        test = result.scalar_one_or_none()

        if not test:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Test with name '{test_name}' not found",
            )
        return test

    async def get_tests(
        self,
        skip: int = 0,
        limit: int = 100,
        work_package_name: Optional[str] = None,
        element_cms_id: Optional[str] = None,
        test_name: Optional[str] = None,
        is_public: Optional[bool] = None,
    ) -> tuple[List[Test], int]:
        """Get tests with filtering and pagination."""
        stmt = select(Test)

        # Apply filters.
        # NOTE on equality vs. ilike: test_name uses exact equality because
        # values like "TB" are substrings of "TB-Microfludic" — using ilike
        # would silently include TBM rows when you filter by TB. The
        # work_package and element fields keep ilike for now to preserve
        # existing behavior, but watch for prefix collisions there too
        # (e.g. "WP2" would match a hypothetical "WP20").
        if work_package_name:
            stmt = stmt.filter(Test.work_package_name.ilike(f"%{work_package_name}%"))
        if element_cms_id:
            stmt = stmt.filter(Test.element_cms_id.ilike(f"%{element_cms_id}%"))
        if test_name:
            stmt = stmt.filter(Test.test_name == test_name)
        if is_public is not None:
            stmt = stmt.filter(Test.is_public == is_public)

        # Get total count after filters, before pagination.
        count_stmt = select(func.count()).select_from(stmt.subquery())
        count_result = await self.db.execute(count_stmt)
        total = count_result.scalar()

        # Apply pagination.
        stmt = stmt.offset(skip).limit(limit)
        result = await self.db.execute(stmt)
        tests = result.scalars().all()

        return list(tests), total

    async def update_test(self, test_id: int, test_data: TestUpdate) -> Test:
        """Update a test."""
        test = await self.get_test_by_id(test_id)

        update_data = test_data.dict(exclude_unset=True)

        # Check if combination is being updated and if it conflicts.
        combination_fields = {"test_name", "work_package_name", "element_cms_id"}
        if any(field in update_data for field in combination_fields):
            new_work_package = update_data.get("work_package_name", test.work_package_name)
            new_test_name = update_data.get("test_name", test.test_name)
            new_element_cms_id = update_data.get("element_cms_id", test.element_cms_id)

            stmt = select(Test).filter(
                Test.work_package_name == new_work_package,
                Test.test_name == new_test_name,
                Test.element_cms_id == new_element_cms_id,
                Test.id != test_id,
            )
            result = await self.db.execute(stmt)
            existing_test = result.scalar_one_or_none()

            if existing_test:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=(
                        f"Test with name '{new_test_name}' for work package "
                        f"'{new_work_package}' and element "
                        f"'{new_element_cms_id}' already exists"
                    ),
                )

        for field, value in update_data.items():
            setattr(test, field, value)

        await self.db.commit()
        await self.db.refresh(test)
        return test

    async def delete_test(self, test_id: int) -> bool:
        """Delete a test."""
        test = await self.get_test_by_id(test_id)
        await self.db.delete(test)
        await self.db.commit()
        return True

    async def get_tests_by_work_package(self, work_package_name: str) -> List[Test]:
        """Get all tests for a specific work package."""
        stmt = select(Test).filter(Test.work_package_name == work_package_name)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def get_public_tests(
        self, skip: int = 0, limit: int = 100
    ) -> tuple[List[Test], int]:
        """Get only public tests."""
        return await self.get_tests(skip=skip, limit=limit, is_public=True)

    async def bulk_update_release_flags(
        self,
        test_ids: List[int],
        release_flags: dict,
    ) -> List[Test]:
        """Bulk update release flags for multiple tests."""
        stmt = select(Test).filter(Test.id.in_(test_ids))
        result = await self.db.execute(stmt)
        tests = list(result.scalars().all())

        if len(tests) != len(test_ids):
            found_ids = [test.id for test in tests]
            missing_ids = [tid for tid in test_ids if tid not in found_ids]
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Tests with IDs {missing_ids} not found",
            )

        for test in tests:
            for field, value in release_flags.items():
                if hasattr(test, field):
                    setattr(test, field, value)

        await self.db.commit()
        for test in tests:
            await self.db.refresh(test)
        return tests

    async def get_listings(self, request: TestListings, is_private_user: bool):
        # Build base condition for privacy.
        privacy_condition = True if is_private_user else (Test.is_public == True)

        if (
            request.work_package_name is None
            and request.element_cms_id is None
            and request.test_name is None
        ):
            result = await self.db.execute(
                select(Test.work_package_name).where(privacy_condition).distinct()
            )
            return ListingsResponse(
                work_packages=[row[0] for row in result.all()]
            )

        elif (
            request.work_package_name is not None
            and request.element_cms_id is None
            and request.test_name is None
        ):
            result = await self.db.execute(
                select(Test.element_cms_id).where(
                    and_(
                        Test.work_package_name == request.work_package_name,
                        privacy_condition,
                    )
                ).distinct()
            )
            return ListingsResponse(
                element_cms_ids=[row[0] for row in result.all()],
            )

        elif (
            request.work_package_name is not None
            and request.element_cms_id is not None
            and request.test_name is None
        ):
            result = await self.db.execute(
                select(Test.test_name).where(
                    and_(
                        Test.work_package_name == request.work_package_name,
                        Test.element_cms_id == request.element_cms_id,
                        privacy_condition,
                    )
                ).distinct()
            )
            return ListingsResponse(
                test_names=[row[0] for row in result.all()],
            )

        elif (
            request.work_package_name is not None
            and request.element_cms_id is not None
            and request.test_name is not None
        ):
            result = await self.db.execute(
                select(Test).where(
                    and_(
                        Test.work_package_name == request.work_package_name,
                        Test.element_cms_id == request.element_cms_id,
                        Test.test_name == request.test_name,
                        privacy_condition,
                    )
                )
            )
            test = result.scalar_one_or_none()

            if test and not is_private_user:
                # Filter data for public users — only return released sheets.
                filtered_test = TestResponse(
                    id=test.id,
                    work_package_name=test.work_package_name,
                    element_cms_id=test.element_cms_id,
                    test_name=test.test_name,
                    test_details=test.test_details if test.release_test_details else None,
                    raw_data=test.raw_data if test.release_raw_data else None,
                    processed_data=test.processed_data if test.release_processed_data else None,
                    final_results=test.final_results if test.release_final_results else None,
                    statistical_analysis=test.statistical_analysis if test.release_statistical_analysis else None,
                    is_public=test.is_public,
                    release_test_details=test.release_test_details,
                    release_raw_data=test.release_raw_data,
                    release_processed_data=test.release_processed_data,
                    release_final_results=test.release_final_results,
                    release_statistical_analysis=test.release_statistical_analysis,
                    test_result=test.test_result,
                    file_path=test.file_path,
                    created_at=test.created_at,
                    updated_at=test.updated_at,
                )
                return filtered_test

            return test

        else:
            return None