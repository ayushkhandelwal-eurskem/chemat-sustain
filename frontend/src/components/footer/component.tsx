"use client";

import { usePathname } from "next/navigation";

export default function Footer() {
    const pathname = usePathname();
    if (pathname?.startsWith("/login")) return null;

    return (
        <footer className="w-full bg-sky-100 py-4 px-6">
            <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between md:items-center items-left">
                <div className="flex flex-col md:flex-row items-center xl:space-x-4 xl:mx-55 xl:my-5">
                    <img src="https://chematsustain.eu/wp-content/uploads/2024/03/normal-reproduction-high-resolution-1024x683.jpg" alt="EU Flag" className="h-12 w-auto" />
                    <p className="text-green-600 text-base">
                        The project CheMatSustain under No. 101137990 has received funding from the European Union under the Horizon Europe Programme
                    </p>
                </div>

                <div className="mt-3 md:mt-0 flex flex-col md:space-x-4">
                    <a href="https://chematsustain.eu/?page_id=3" className="text-blue-500 hover:text-blue-700 text-sm text-nowrap">Privacy Policy</a>
                    <a href="https://chematsustain.eu/?page_id=256" className="text-blue-500 hover:text-blue-700 text-sm">Disclaimer</a>
                </div>
            </div>
        </footer>
    )
}