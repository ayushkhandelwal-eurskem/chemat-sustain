// File: app/wp3/[element]/[test]/page.tsx

import { FC } from 'react';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import RoleAwareTestViewer from '@/components/tests/RoleAwareTestViewer';

interface PageProps {
  params: Promise<{
    work_package: string;
    element: string;
    test: string;
    file: string;
  }>;
}

const DynamicRoutePage: FC<PageProps> = async ({ params }) => {
  const decodedParams = await params;
  const work_package = decodeURIComponent(decodedParams.work_package);
  const element = decodeURIComponent(decodedParams.element);
  const test = decodeURIComponent(decodedParams.test);

  return (
    <ProtectedRoute requireAuth={true}>
      <RoleAwareTestViewer
        work_package={work_package}
        element={element}
        test={test}
        file=""
      />
    </ProtectedRoute>
  );
};

export default DynamicRoutePage;