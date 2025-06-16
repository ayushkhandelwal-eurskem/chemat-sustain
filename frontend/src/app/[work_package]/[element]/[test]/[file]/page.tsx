// File: app/wp3/[element]/[test]/page.tsx

import MTTDataViewer from '@/components/tests/mtt/page';
import { FC } from 'react';
import DLSDataViewer from '@/components/tests/dls/page';
// Define the props type for the page component
interface PageProps {
  params: Promise<{
    work_package: string;
    element: string;
    test: string;
    file: string;
  }>;
}

// Create the page component
const DynamicRoutePage: FC<PageProps> = async ({ params }) => {
  // Await the entire params object first
  const decodedParams = await params;
  
  // Then access its properties
  const work_package = decodeURIComponent(decodedParams.work_package);
  const element = decodeURIComponent(decodedParams.element);
  const test = decodeURIComponent(decodedParams.test);
  const file = decodeURIComponent(decodedParams.file);
  
  if (test.toLowerCase() === "mtt") {
    return (<MTTDataViewer work_package={work_package} element={element} test={test} file={file} />);
  }
  if (test.toLocaleLowerCase() === "dls"){
    return (<DLSDataViewer work_package={work_package} element={element} test={test} file={file}></DLSDataViewer>)
  }
};

export default DynamicRoutePage;
