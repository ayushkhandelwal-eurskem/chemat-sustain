// File: app/wp3/[element]/[test]/page.tsx

import MTTDataViewer from '@/components/tests/mtt/page';
import { FC } from 'react';
import DLSDataViewer from '@/components/tests/dls/page';
import FTIRDataViewer from '@/components/tests/ftir/page';
import HRSTEMDataViewer from '@/components/tests/hr_stem/page';
import UVVisDataViewer from '@/components/tests/uv_vis/page';
import ZetaDataViewer from '@/components/tests/zeta/page';
import SIMSDataViewer from '@/components/tests/sims/page';
import ROSDataViewer from '@/components/tests/ros/page';
import TBDataViewer from '@/components/tests/tb/page';
import TBMDataViewer from '@/components/tests/tbm/page';
import UPSDataViewer from '@/components/tests/ups/page';
import XPSDataViewer from '@/components/tests/xps/page';
import XRDDataViewer from '@/components/tests/xrd/page';
import DSCDataViewer from '@/components/tests/dsc/page';
import TGADataViewer from '@/components/tests/tga/page';
import MNTDataViewer from '@/components/tests/mnt/page';
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
  
  if (test.toLowerCase() === "mtt") {
    return (<MTTDataViewer work_package={work_package} element={element} test={test} />);
  }
  if (test.toLocaleLowerCase() === "dls"){
    return (<DLSDataViewer work_package={work_package} element={element} test={test} file={""}></DLSDataViewer>)
  }
  if (test.toLocaleLowerCase() === "ftir"){
    return (<FTIRDataViewer work_package={work_package} element={element} test={test} file={""}></FTIRDataViewer>)
  }
  if (test.toLocaleLowerCase() === "hr-stem"){
    return (<HRSTEMDataViewer work_package={work_package} element={element} test={test} file={""}></HRSTEMDataViewer>)
  }
  if (test.toLocaleLowerCase() === "uv-vis"){
    return (<UVVisDataViewer work_package={work_package} element={element} test={test} file={""}></UVVisDataViewer>)
  }
  if (test.toLocaleLowerCase() === "zeta"){
    return (<ZetaDataViewer work_package={work_package} element={element} test={test} file={""}></ZetaDataViewer>)
  }
  if (test.toLocaleLowerCase() === "sims"){
    return (<SIMSDataViewer work_package={work_package} element={element} test={test} file={""}></SIMSDataViewer>)
  }
  if (test.toLocaleLowerCase() === "ros"){
    return (<ROSDataViewer work_package={work_package} element={element} test={test} file={""}></ROSDataViewer>)
  }
  if (test.toLocaleLowerCase() === "tb"){
    return (<TBDataViewer work_package={work_package} element={element} test={test} file={""}></TBDataViewer>)
  }
  if (test.toLocaleLowerCase() === "TB Microfludic"){
    return (<TBMDataViewer work_package={work_package} element={element} test={test} file={""}></TBMDataViewer>)
  }
  if (test.toLocaleLowerCase() === "ups"){
    return (<UPSDataViewer work_package={work_package} element={element} test={test} file={""}></UPSDataViewer>)
  }
  if (test.toLocaleLowerCase() === "xps"){
    return (<XPSDataViewer work_package={work_package} element={element} test={test} file={""}></XPSDataViewer>)
  }
  if (test.toLocaleLowerCase() === "xrd"){
    return (<XRDDataViewer work_package={work_package} element={element} test={test} file={""}></XRDDataViewer>)
  }
  if (test.toLocaleLowerCase() === "dsc"){
    return (<DSCDataViewer work_package={work_package} element={element} test={test} file={""}></DSCDataViewer>)
  }
  if (test.toLocaleLowerCase() === "tga"){
    return (<TGADataViewer work_package={work_package} element={element} test={test} file={""}></TGADataViewer>)
  }
  if (test.toLocaleLowerCase() === "mnt"){
    return (<MNTDataViewer work_package={work_package} element={element} test={test} file={""}></MNTDataViewer>)
  }
};

export default DynamicRoutePage;
