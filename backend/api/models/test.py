from sqlalchemy import Column, Integer, String, JSON, Boolean, DateTime, ForeignKey
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from utils.db import Base



class Test(Base):
    __tablename__ = "tests"

    id = Column(Integer, primary_key=True, index=True)
    organisation_id = Column(String(36), ForeignKey("organisations.id"), nullable=True, index=True)
    work_package_name = Column(String, index=True)
    element_cms_id = Column(String, index=True)
    test_name = Column(String, index=True)
    
    test_details = Column(JSON, nullable=True)
    raw_data = Column(JSON, nullable=True)
    processed_data = Column(JSON, nullable=True)
    final_results = Column(JSON, nullable=True)
    statistical_analysis = Column(JSON, nullable=True)

    is_public = Column(Boolean, default=False)
    release_test_details = Column(Boolean, default=False)
    release_raw_data = Column(Boolean, default=False)
    release_processed_data = Column(Boolean, default=False)
    release_final_results = Column(Boolean, default=False)
    release_statistical_analysis = Column(Boolean, default=False)

    test_result = Column(Boolean, nullable=True)

    file_path = Column(String, nullable=True)
    
    created_at = Column(DateTime, nullable=False, default=func.now())
    updated_at = Column(DateTime, nullable=False, default=func.now(), onupdate=func.now())
