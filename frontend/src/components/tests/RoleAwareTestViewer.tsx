"use client";

import { ComponentType, FC } from "react";
import { useAuth } from "@/contexts/AuthContext";
import PublicReleasedDataViewer from "@/components/tests/PublicReleasedDataViewer";
import MTTDataViewer from "@/components/tests/mtt/page";
import DLSDataViewer from "@/components/tests/dls/page";
import FTIRDataViewer from "@/components/tests/ftir/page";
import HRSTEMDataViewer from "@/components/tests/hr_stem/page";
import UVVisDataViewer from "@/components/tests/uv_vis/page";
import ZetaDataViewer from "@/components/tests/zeta/page";
import SIMSDataViewer from "@/components/tests/sims/page";
import ROSDataViewer from "@/components/tests/ros/page";
import TBDataViewer from "@/components/tests/tb/page";
import TBMDataViewer from "@/components/tests/tbm/page";
import UPSDataViewer from "@/components/tests/ups/page";
import XPSDataViewer from "@/components/tests/xps/page";
import XRDDataViewer from "@/components/tests/xrd/page";
import DSCDataViewer from "@/components/tests/dsc/page";
import TGADataViewer from "@/components/tests/tga/page";
import MNTDataViewer from "@/components/tests/mnt/page";
import RotifierDataViewer from "@/components/tests/rotifier/page";
import WaterFleaDataViewer from "@/components/tests/waterplea/page";
import AlgaeDataViewer from "@/components/tests/algae/page";

interface ViewerProps {
  work_package: string;
  element: string;
  test: string;
  file: string;
}

const SPECIALISED_VIEWERS: Record<string, ComponentType<ViewerProps>> = {
  mtt: MTTDataViewer,
  dls: DLSDataViewer,
  ftir: FTIRDataViewer,
  "hr-stem": HRSTEMDataViewer,
  "uv-vis": UVVisDataViewer,
  zeta: ZetaDataViewer,
  sims: SIMSDataViewer,
  ros: ROSDataViewer,
  tb: TBDataViewer,
  "tb-microfludic": TBMDataViewer,
  ups: UPSDataViewer,
  xps: XPSDataViewer,
  xrd: XRDDataViewer,
  dsc: DSCDataViewer,
  tga: TGADataViewer,
  mnt: MNTDataViewer,
  rotifier: RotifierDataViewer,
  waterflea: WaterFleaDataViewer,
  algae: AlgaeDataViewer,
};

const RoleAwareTestViewer: FC<ViewerProps> = (props) => {
  const { user } = useAuth();
  const testKey = props.test.toLowerCase();
  const SpecialisedViewer = SPECIALISED_VIEWERS[testKey];

  if (!SpecialisedViewer) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 p-6 text-gray-700">
        <div className="text-center">
          <h2 className="mb-2 text-xl font-semibold">Unknown test type</h2>
          <p>No viewer is configured for &quot;{props.test}&quot;.</p>
        </div>
      </div>
    );
  }

  const releaseSafeSpecialisedViewer = testKey === "tb" || testKey === "tb-microfludic";

  if (user?.role === "public_viewer" && !releaseSafeSpecialisedViewer) {
    return <PublicReleasedDataViewer {...props} specialisedViewer={SpecialisedViewer} />;
  }

  return <SpecialisedViewer {...props} />;
};

export default RoleAwareTestViewer;
