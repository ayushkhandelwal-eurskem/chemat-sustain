// File: app/wp3/[element]/[test]/page.tsx

import { FC } from 'react';
import MTTDataViewer from '@/components/tests/mtt/page';
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
import RotifierDataViewer from '@/components/tests/rotifier/page';
import WaterFleaDataViewer from '@/components/tests/waterplea/page';
import AlgaeDataViewer from '@/components/tests/algae/page';

interface PageProps {
  params: Promise<{
    work_package: string;
    element: string;
    test: string;
    file: string;
  }>;
}

interface ViewerProps {
  work_package: string;
  element: string;
  test: string;
  file: string;
}

// Single source of truth. Add a new test type here and the route picks
// it up automatically. Keys MUST be lowercase — they're matched against
// test.toLowerCase().
const VIEWERS: Record<string, FC<ViewerProps>> = {
  "mtt": MTTDataViewer,
  "dls": DLSDataViewer,
  "ftir": FTIRDataViewer,
  "hr-stem": HRSTEMDataViewer,
  "uv-vis": UVVisDataViewer,
  "zeta": ZetaDataViewer,
  "sims": SIMSDataViewer,
  "ros": ROSDataViewer,
  "tb": TBDataViewer,
  "tb-microfludic": TBMDataViewer,
  "ups": UPSDataViewer,
  "xps": XPSDataViewer,
  "xrd": XRDDataViewer,
  "dsc": DSCDataViewer,
  "tga": TGADataViewer,
  "mnt": MNTDataViewer,
  "rotifier": RotifierDataViewer,
  "waterflea": WaterFleaDataViewer,
  "algae": AlgaeDataViewer,
};

const DynamicRoutePage: FC<PageProps> = async ({ params }) => {
  const decodedParams = await params;
  const work_package = decodeURIComponent(decodedParams.work_package);
  const element = decodeURIComponent(decodedParams.element);
  const test = decodeURIComponent(decodedParams.test);

  const Viewer = VIEWERS[test.toLowerCase()];

  if (!Viewer) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 text-gray-700 p-6">
        <div className="text-center">
          <h2 className="text-xl font-semibold mb-2">Unknown test type</h2>
          <p>No viewer is configured for &quot;{test}&quot;.</p>
        </div>
      </div>
    );
  }

  return (
    <Viewer
      work_package={work_package}
      element={element}
      test={test}
      file=""
    />
  );
};

export default DynamicRoutePage;