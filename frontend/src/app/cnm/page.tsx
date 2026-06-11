'use client';

import { useMemo, useState, FC } from 'react';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import { Search, ExternalLink } from 'lucide-react';

/* ------------------------------------------------------------------ */
/* Reference data — List of selected CNMs (from CMS Material           */
/* Identifier Final DB). Sheet 1: identifiers. Sheet 2: characteristics*/
/* & sources. Static reference content.                                */
/* ------------------------------------------------------------------ */

interface IdentifierRow {
  no: number;
  cms: string;
  erm: string;
  type: string;
  core: string;
}

interface CharacteristicRow {
  name: string;
  char: string;
  source: string[];
}

const IDENTIFIERS: IdentifierRow[] = [
  { no: 1, cms: `CMS_1a_AuNP`, erm: `ERM00000637`, type: `Gold nanoparticles, size 1, sodium citrate stabilized`, core: `Gold` },
  { no: 2, cms: `CMS_ 2a_AuNP`, erm: `ERM00000638`, type: `Gold nanoparticles, size 2, sodium citrate stabilized`, core: `Gold` },
  { no: 3, cms: `CMS_3a_AuNP`, erm: `ERM00000639`, type: `Gold nanoparticles, size 3, sodium citrates stabilized`, core: `Gold` },
  { no: 4, cms: `CMS_4a_AuNP`, erm: `ERM00000640`, type: `Gold nanoparticles, size 1, PEG stabilized`, core: `Gold` },
  { no: 5, cms: `CMS_5a_AuNP`, erm: `ERM00000641`, type: `Gold nanoparticles, size 2, PEG stabilized`, core: `Gold` },
  { no: 6, cms: `CMS_6a_AuNP`, erm: `ERM00000642`, type: `Gold nanoparticles, size 3, PEG stabilized`, core: `Gold` },
  { no: 7, cms: `CMS_7a_AgNP`, erm: `ERM00000643`, type: `Silver nanoparticles, size 1, sodium citrate stabilized`, core: `Silver` },
  { no: 8, cms: `CMS_8a_AgNP`, erm: `ERM00000644`, type: `Silver nanoparticles, size 2, sodium citrate stabilized`, core: `Silver` },
  { no: 9, cms: `CMS_9a_AgNP`, erm: `ERM00000645`, type: `Silver nanoparticles, size 3, sodium citrate stabilized`, core: `Silver` },
  { no: 10, cms: `CMS_10a_AgNP`, erm: `ERM00000646`, type: `Silver nanoparticles, size 1, PEG stabilized`, core: `Silver` },
  { no: 11, cms: `CMS_11a_AgNP`, erm: `ERM00000647`, type: `Silver nanoparticles, size 2, PEG stabilized`, core: `Silver` },
  { no: 12, cms: `CMS_12a_AgNP`, erm: `ERM00000648`, type: `Silver nanoparticles, size 3, PEG stabilized`, core: `Silver` },
  { no: 13, cms: `CMS_13a_AgNR`, erm: `ERM00000649`, type: `Silver nanorods 1`, core: `Silver` },
  { no: 14, cms: `CMS_14a_AgNR`, erm: `ERM00000650`, type: `Silver nanorods 2`, core: `Silver` },
  { no: 15, cms: `CMS_15a_TNR`, erm: `ERM00000651`, type: `Nano TiO2, rutile`, core: `TiO2` },
  { no: 16, cms: `CMS 16a TMR`, erm: `ERM00000652`, type: `Micro TiO2, rutile`, core: `TiO2` },
  { no: 17, cms: `CMS 17a TNA`, erm: `ERM00000653`, type: `Nano TiO2, anatase`, core: `TiO2` },
  { no: 18, cms: `CMS_18a_TMA`, erm: `ERM00000654`, type: `Micro TiO2, anatase`, core: `TiO2` },
  { no: 19, cms: `CMS_19a_NC`, erm: `ERM00000655`, type: `Nanocellulose`, core: `Cellulose` },
  { no: 20, cms: `CMS_20a_MC`, erm: `ERM00000656`, type: `Microcellulose`, core: `Cellulose` },
  { no: 21, cms: `CMS_21a_DG4`, erm: `ERM00000657`, type: `PAMAM dendrimer, generation 4`, core: `Diamine` },
  { no: 22, cms: `CMS_22a_DG5`, erm: `ERM00000658`, type: `PAMAM dendrimer, generation 5`, core: `Diamine` },
  { no: 23, cms: `CMS_23a_DG6`, erm: `ERM00000659`, type: `PAMAM dendrimer, generation 6`, core: `Diamine` },
  { no: 24, cms: `CMS_24a_PS1`, erm: `ERM00000660`, type: `Polystyrene spheres, size 1`, core: `Styrene` },
  { no: 25, cms: `CMS_25a_PS2`, erm: `ERM00000661`, type: `Polystyrene spheres, size 2`, core: `Styrene` },
  { no: 26, cms: `CMS_26a_CH_CIT`, erm: ``, type: `Sodium citrate`, core: `NA` },
  { no: 27, cms: `CMS_27a_CH_PEG`, erm: ``, type: `Poly(ethylene glycol) methyl ether thiol`, core: `NA` },
  { no: 28, cms: `CMS_28a_CH_PVP`, erm: ``, type: `Polyvinylpyrrolidone`, core: `NA` },
  { no: 29, cms: `CMS_29a_CH_TOR`, erm: ``, type: `Tormentic acid`, core: `NA` },
  { no: 30, cms: `CMS_30a_CH_TER`, erm: `ERM00000662`, type: `Triterpenic acids obtained from RS (Red Sentinel) callus extract`, core: `NA` }
];

const CHARACTERISTICS: CharacteristicRow[] = [
  { name: `CMS_1a_AuNP`, char: `Gold nanoparticles, size 1, sodium citrate stabilized`, source: [`Synthesized at the ULODZ`, `To obtain 1 kg of AuNP colloid with a gold concentration of 100 ppm (0.01%), use ~ 0.18 g of HAuCl4, and ~ 0.5 g of a reducing agent (sodium citrate and/or sodium borohydride). The estimated amount of water used is ~ 2 litres (for 5 nm) and ~ 50 litres (for 13 nm and 30 nm) and power consumption is ~ 1 kWh.`] },
  { name: `CMS_ 2a_AuNP`, char: `Gold nanoparticles, size 2, sodium citrate stabilized`, source: [`Synthesized at the ULODZ as above`] },
  { name: `CMS_3a_AuNP`, char: `Gold nanoparticles, size 3, sodium citrates stabilized`, source: [`Synthesized at the ULODZ as above`] },
  { name: `CMS_4a_AuNP`, char: `Gold nanoparticles, size 1, PEG stabilized`, source: [`Synthesized at the ULODZ`, `To obtain 1 kg of AuNP colloid with a gold concentration of 100 ppm (0.01%), use ~ 0.18 g of HAuCl4, ~ 0.5 g of a reducing agent (sodium citrate and/or sodium borohydride), surface modifier 0,.1 g of PEG (Poly(ethylene glycol) methyl ether thiol average Mn 800). The estimated amount of water used is ~ 2 litres (for 5 nm) and ~ 50 litres (for 13 nm and 30 nm) and power consumption is ~ 1 kWh.`] },
  { name: `CMS_5a_AuNP`, char: `Gold nanoparticles, size 2, PEG stabilized`, source: [`Synthesized at the ULODZ`, `as above`] },
  { name: `CMS_6a_AuNP`, char: `Gold nanoparticles, size 3, PEG stabilized`, source: [`Synthesized at the ULODZ`, `as above`] },
  { name: `CMS_7a_AgNP`, char: `Silver nanoparticles, size 1, sodium citrate stabilized`, source: [`Synthesized at the ULODZ`, `To obtain 1 kg of AgNP colloid with a silver concentration of 100 ppm (0.01%), use ~ 0.16 g of AgNO3, and ~ 0.5 g of a reducing agent (sodium citrate and/or sodium borohydride). The estimated amount of water used is ~ 2 litres (for 5 nm and 13 nm) and ~ 50 litres (30 nm) and power consumption is ~ 1 kWh.`] },
  { name: `CMS_8a_AgNP`, char: `Silver nanoparticles, size 2, sodium citrate stabilized`, source: [`Synthesized at the ULODZ as above`] },
  { name: `CMS_9a_AgNP`, char: `Silver nanoparticles, size 3, sodium citrate stabilized`, source: [`Synthesized at the ULODZ as above`] },
  { name: `CMS_10a_AgNP`, char: `Silver nanoparticles, size 1, PEG stabilized`, source: [`Synthesized at the ULODZ`, `AgNO3, ~ 0.5 g of a reducing agent (sodium citrate and/or sodium borohydride). The estimated amount of water used is ~ 2 litres (for 5 nm and 13 nm) and ~ 50 litres (30 nm) and power consumption is ~ 1 kWh.`] },
  { name: `CMS_11a_AgNP`, char: `Silver nanoparticles, size 2, PEG stabilized`, source: [`Synthesized at the ULODZ`, `as above`] },
  { name: `CMS_12a_AgNP`, char: `Silver nanoparticles, size 3, PEG stabilized`, source: [`Synthesized at the ULODZ`, `as above`] },
  { name: `CMS_13a_AgNR`, char: `Silver nanorods 1`, source: [`Synthesized at the ULODZ`, `To obtain 1 kg of AgNP colloid with a silver concentration of 100 ppm (0.01%), use ~ 0.16 g of AgNO3, and ~ 0.5 g of a reducing agent (sodium citrate and/or sodium borohydride). Surface modifier 0,.1 g of PEG (Poly(ethylene glycol) methyl ether thiol average Mn 800). The estimated amount of water used is ~ 2 litres (for 5 nm and 13 nm) and ~ 50 litres (30 nm) and power consumption is ~ 1 kWh.`] },
  { name: `CMS_14a_AgNR`, char: `Silver nanorods 2`, source: [`Synthesized at the ULODZ`, `as above`] },
  { name: `CMS_15a_TNR`, char: `Nano TiO2, rutile`, source: [`US Research Nanomaterials, Inc`, `https://www.us-nano.com/inc/sdetail/276`] },
  { name: `CMS 16a TMR`, char: `Micro TiO2, rutile`, source: [`US Research Nanomaterials, Inc`, `https://www.us-nano.com/inc/sdetail/1796`] },
  { name: `CMS 17a TNA`, char: `Nano TiO2, anatase`, source: [`JRC Repository`, `https://publications.jrc.ec.europa.eu/repository/handle/JRC86291`] },
  { name: `CMS_18a_TNA`, char: `Micro TiO2, anatase`, source: [`US Research Nanomaterials, Inc`, `https://www.us-nano.com/inc/sdetail/1796`] },
  { name: `CMS_19a_NC`, char: `Nanocellulose`, source: [`Cellulose Lab`, `https://celluloselab.com/our-products/cnc-ncc-cellulose-nanocrystals/`] },
  { name: `CMS_20a_MC`, char: `Microcellulose`, source: [`Merck`, `https://www.sigmaaldrich.com/PL/pl/product/aldrich/310697`] },
  { name: `CMS_21a_DG4`, char: `PAMAM dendrimer, generation 4`, source: [`Merck or Dendritech`, `https://www.sigmaaldrich.com/PL/pl/product/aldrich/412449`, `or`, `https://www.dendritech.com/pamam.html`] },
  { name: `CMS_22a_DG5`, char: `PAMAM dendrimer, generation 5`, source: [`Merck or Dendritech`, `https://www.sigmaaldrich.com/PL/pl/product/aldrich/536709`, `or`, `https://www.dendritech.com/pamam.html`] },
  { name: `CMS_ 23a_DG6`, char: `PAMAM dendrimer, generation 6`, source: [`Merck or Dendritech`, `https://www.sigmaaldrich.com/PL/pl/product/aldrich/536717`, `or`, `https://www.dendritech.com/pamam.html`] },
  { name: `CMS_24a_PS1`, char: `Polystyrene spheres, size 1`, source: [`Merck`, `https://www.sigmaaldrich.com/PL/pl/product/sigma/89904 (1mm)`] },
  { name: `CMS_25a_PS2`, char: `Polystyrene spheres, size 2`, source: [`Merck`, `https://www.sigmaaldrich.com/PL/pl/product/sial/90517 (100 nm)`, `or`, `NIST Standard`, `https://www.polysciences.com/default/nanobead-nist-traceable-particle-size-standard-40nm (40nm)`] },
  { name: `CMS_26a_CH_CIT`, char: `Sodium citrate`, source: [`Merck`, `https://www.sigmaaldrich.com/PL/pl/product/sial/s4641`] },
  { name: `CMS_27a_CH_PEG`, char: `Poly(ethylene glycol) methyl ether thiol`, source: [`Merck`, `https://www.sigmaaldrich.com/PL/pl/product/aldrich/729108`] },
  { name: `CMS_28a_CH_PVP`, char: `Polyvinylpyrrolidone`, source: [`Merck`, `https://www.sigmaaldrich.com/PL/pl/product/aldrich/856568`] },
  { name: `CMS_29a_CH_TOR`, char: `Tormentic acid`, source: [`Merck`, `https://www.sigmaaldrich.com/PL/pl/product/supelco/phl85836 supplied by UNIURB`] },
  { name: `CMS_30a_CH_TER`, char: `Triterpenic acids obtained from RS (Red Sentinel) callus extract`, source: [`Synthesized (extracted) at the UNIURB`] }
];

const isUrl = (s: string) => /^https?:\/\//i.test(s);

/* ----------------------------- Page ----------------------------- */
const CNMPage: FC = () => {
  const [query, setQuery] = useState('');

  const q = query.trim().toLowerCase();

  const filteredIdentifiers = useMemo(() => {
    if (!q) return IDENTIFIERS;
    return IDENTIFIERS.filter((r) =>
      [r.cms, r.erm, r.type, r.core].some((v) => v.toLowerCase().includes(q))
    );
  }, [q]);

  const filteredCharacteristics = useMemo(() => {
    if (!q) return CHARACTERISTICS;
    return CHARACTERISTICS.filter((r) =>
      [r.name, r.char, ...r.source].some((v) => v.toLowerCase().includes(q))
    );
  }, [q]);

  return (
    <ProtectedRoute requireAuth={true}>
      <div className="bg-white min-h-screen">
        <div className="container mx-auto px-4 py-10 max-w-6xl">
          {/* Header */}
          <div className="bg-white rounded-lg shadow-md p-8 mb-8 border border-gray-100">
            <p className="text-sm font-medium tracking-wide uppercase text-blue-700 mb-1">
              Selected chemicals &amp; nanomaterials (CNM&apos;s) data
            </p>
            <h1 className="text-3xl font-bold text-blue-900 tracking-tight">
              List of selected CNMs
            </h1>
            <p className="text-blue-900/70 mt-3 max-w-3xl leading-relaxed">
              The chemicals and nanomaterials studied in CheMatSustain, with their
              CMS internal identifiers and ERM identifiers, followed by sample
              characteristics and material sources.
            </p>

            {/* Search */}
            <div className="mt-6 relative max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-blue-900/40" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search identifier, ERM, type, or core…"
                className="w-full pl-9 pr-3 py-2.5 border border-blue-900/30 rounded-md text-sm text-blue-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          {/* ---- Table 1: Identifiers ---- */}
          <section className="bg-white rounded-lg shadow-md p-6 mb-8">
            <div className="mb-4">
              <div>
                <h2 className="text-xl font-bold text-blue-900">Material identifiers</h2>
                <p className="text-sm text-blue-900/60">
                  {filteredIdentifiers.length} of {IDENTIFIERS.length} materials
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full border border-gray-200 text-sm">
                <thead>
                  <tr className="bg-gray-100 text-left">
                    <th className="py-2.5 px-4 border-b border-gray-200 font-semibold text-blue-900 w-12">#</th>
                    <th className="py-2.5 px-4 border-b border-gray-200 font-semibold text-blue-900">CMS Internal Identifier</th>
                    <th className="py-2.5 px-4 border-b border-gray-200 font-semibold text-blue-900">ERM Identifier</th>
                    <th className="py-2.5 px-4 border-b border-gray-200 font-semibold text-blue-900">Type</th>
                    <th className="py-2.5 px-4 border-b border-gray-200 font-semibold text-blue-900">Core</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredIdentifiers.map((r, i) => (
                    <tr key={r.cms} className={i % 2 === 1 ? 'bg-gray-50' : 'bg-white'}>
                      <td className="py-2 px-4 border-b border-gray-100 text-blue-900/50">{r.no}</td>
                      <td className="py-2 px-4 border-b border-gray-100 font-medium text-blue-900 font-mono text-[13px]">{r.cms}</td>
                      <td className="py-2 px-4 border-b border-gray-100 text-slate-700 font-mono text-[13px]">{r.erm || <span className="text-slate-300">—</span>}</td>
                      <td className="py-2 px-4 border-b border-gray-100 text-slate-700">{r.type}</td>
                      <td className="py-2 px-4 border-b border-gray-100">
                        <span className="inline-block px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-xs font-medium">
                          {r.core}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {filteredIdentifiers.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-400">
                        No materials match your search.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* ---- Table 2: Characteristics & sources ---- */}
          <section className="bg-white rounded-lg shadow-md p-6">
            <div className="mb-4">
              <div>
                <h2 className="text-xl font-bold text-blue-900">Sample characteristics &amp; sources</h2>
                <p className="text-sm text-blue-900/60">
                  {filteredCharacteristics.length} of {CHARACTERISTICS.length} samples
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full border border-gray-200 text-sm">
                <thead>
                  <tr className="bg-gray-100 text-left">
                    <th className="py-2.5 px-4 border-b border-gray-200 font-semibold text-blue-900 align-top">Sample Name</th>
                    <th className="py-2.5 px-4 border-b border-gray-200 font-semibold text-blue-900 align-top">Sample Characteristics</th>
                    <th className="py-2.5 px-4 border-b border-gray-200 font-semibold text-blue-900 align-top">Source of materials</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCharacteristics.map((r, i) => (
                    <tr key={r.name} className={i % 2 === 1 ? 'bg-gray-50 align-top' : 'bg-white align-top'}>
                      <td className="py-3 px-4 border-b border-gray-100 font-medium text-blue-900 font-mono text-[13px] whitespace-nowrap">{r.name}</td>
                      <td className="py-3 px-4 border-b border-gray-100 text-slate-700">{r.char}</td>
                      <td className="py-3 px-4 border-b border-gray-100 text-slate-700">
                        <div className="space-y-1">
                          {r.source.map((line, idx) =>
                            isUrl(line) ? (
                              <a
                                key={idx}
                                href={line}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-start gap-1 text-blue-600 hover:text-blue-800 hover:underline break-all"
                              >
                                <ExternalLink size={13} className="mt-0.5 shrink-0" />
                                <span>{line}</span>
                              </a>
                            ) : line === 'or' ? (
                              <div key={idx} className="text-slate-400 italic text-xs">or</div>
                            ) : (
                              <div key={idx}>{line}</div>
                            )
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredCharacteristics.length === 0 && (
                    <tr>
                      <td colSpan={3} className="py-8 text-center text-slate-400">
                        No samples match your search.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </ProtectedRoute>
  );
};

export default CNMPage;