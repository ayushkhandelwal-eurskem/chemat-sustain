"use client";

import { useState, useEffect } from "react";

/**
 * Method Protocol No. 5 — Level of free radical generation (ROS)
 *
 * Static content page rendering the CMS Method Protocol document.
 * Drop this component into app/analytics/page.tsx (or import it there).
 */

interface SectionDef {
  id: string;
  label: string;
}

const SECTIONS: SectionDef[] = [
  { id: "overview", label: "Overview" },
  { id: "materials", label: "Materials" },
  { id: "devices", label: "Devices & Tools" },
  { id: "sample-prep", label: "Sample Preparation" },
  { id: "conditions", label: "Experimental Conditions" },
  { id: "procedure", label: "Course of the Experiment" },
  { id: "data-analysis", label: "Data & Analysis" },
];

const MATERIALS: string[] = [
  "Cell line: EA.hy 926 (ATCC® CRL 2922)",
  "Growth Medium: Dulbecco's Modified Eagle's Medium ATCC Cat. No 30-2002 (4 mM L-glutamine, 4500 mg/L glucose, 1 mM sodium pyruvate, and 1500 mg/L sodium bicarbonate), Biowest Cat. No L0104, Corning Cat No 10-013-CV",
  "Fetal Bovine Serum Heat Inactivated, Biowest Cat No S181H",
  "Dulbecco's Phosphate Buffered Saline (DPBS), Biowest Cat. No L0615",
  "Trypsin 0.25%, Biowest Cat. No L0931 (w/o Calcium, w/o Magnesium, w/o Phenol Red, Sterile, Filtered)",
  "Penicillin-Streptomycin-Neomycin Solution, Sigma-Aldrich Cat. No P4-83 (~5,000u penicillin, 5ng streptomycin, 10mg neomycin/ml)",
  "Trypan blue (0.4%)",
  "6-carboxy-2',7'-dichlorodihydrofluorescein diacetate, Invitrogen Cat. No C400",
  "100µM solution H₂O₂, POCh Poland",
];

const DEVICES: string[] = [
  "Laminar flow cabinet",
  "Microplate reader Victor",
  "CO₂ incubator",
  "Laboratory centrifuge",
  "Water bath",
  "Automatic cell counter",
  "Automatic pipettes",
  "Sterile tips for automatic pipettes",
  "Serological pipettes",
  "Sterile Pasteur pipettes",
  "75 cm² culture dishes",
  "Pipettor",
  "Gas burner",
  "Cell counting slides",
  "96-well tissue culture plates",
  "37°C water bath",
];

const PROCEDURE: string[] = [
  "Prepare an appropriate number of flasks with EA.hy-926 cells. The cell confluence should reach about 80–90%.",
  "Seed cells in 96-well tissue culture plates. Use a complete culture medium. Density per well 10⁴ cells/well. Five wells should be allocated for each sample understood as one specific concentration of a given nanomaterial. In addition, a negative control (without addition of test nanomaterial, 5 wells).",
  "Incubate cells in incubator for 24 h.",
  "Replace the complete culture medium with 100 µl serum-free medium.",
  "Add suspension of nanoparticles under test at a concentration of …/well (the amount of nanoparticles will be determined in the course of the experiment).",
  "Incubate cells with nanoparticles in incubator in standard conditions for 24 h.",
  "Add 10 µl of 100µM solution H₂O₂ to each well of the positive control.",
  "Prepare H2DCFDA (carboxyfluorescein diacetate) 100 µM stock solutions in ethanol.",
  "Add 10 µl of H2DCFDA stock solution to each well (final concentration of 10 µM), followed by 30 min incubation at 4°C in the dark before scanning.",
  "Fluorescence reading at 485/530 nm.",
];

const DATA_ANALYSIS: { heading: string; body: string }[] = [
  {
    heading: "Source data format and access path",
    body: "Will be provided.",
  },
  {
    heading: "Analysis and interpretation of results (software used)",
    body: "Will be provided as experiments progress.",
  },
  {
    heading: "Comments and remarks",
    body: "Will be provided as experiments progress.",
  },
];

export default function MethodProtocol() {
  const [activeSection, setActiveSection] = useState<string>("overview");

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length > 0) {
          setActiveSection(visible[0].target.id);
        }
      },
      { rootMargin: "-120px 0px -60% 0px", threshold: 0 }
    );

    SECTIONS.forEach((s) => {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, []);

  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      const y = el.getBoundingClientRect().top + window.scrollY - 96;
      window.scrollTo({ top: y, behavior: "smooth" });
    }
  };

  return (
    <main className="min-h-screen bg-slate-50">
      {/* Hero */}
      <div className="bg-gradient-to-br from-blue-900 via-blue-800 to-sky-700 text-white">
        <div className="max-w-7xl mx-auto px-4 py-12 md:py-16">
          <p className="text-sky-200 text-sm font-medium tracking-widest uppercase">
            Method Protocol No. 5 &middot; Version 0
          </p>
          <h1 className="mt-3 text-3xl md:text-5xl font-bold leading-tight">
            Level of Free Radical Generation
            <span className="block text-sky-300 text-2xl md:text-4xl mt-1">
              Reactive Oxygen Species (ROS) Assay
            </span>
          </h1>
          <p className="mt-5 max-w-3xl text-sky-100 text-base md:text-lg leading-relaxed">
            A fluorometric protocol for quantifying intracellular reactive
            oxygen species in EA.hy 926 endothelial cells following exposure to
            nanomaterials, using H2DCFDA as the redox-sensitive probe.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            <Tag>EA.hy 926 (ATCC® CRL 2922)</Tag>
            <Tag>H2DCFDA probe</Tag>
            <Tag>96-well plate</Tag>
            <Tag>485 / 530 nm</Tag>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-10 grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-10">
        {/* Sticky section nav */}
        <aside className="hidden lg:block">
          <nav className="sticky top-24">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
              On this page
            </p>
            <ul className="space-y-1 border-l border-slate-200">
              {SECTIONS.map((s) => (
                <li key={s.id}>
                  <button
                    onClick={() => scrollTo(s.id)}
                    className={
                      "block w-full text-left pl-4 py-1.5 text-sm -ml-px border-l-2 transition-colors " +
                      (activeSection === s.id
                        ? "border-blue-600 text-blue-700 font-semibold"
                        : "border-transparent text-slate-500 hover:text-blue-700 hover:border-slate-300")
                    }
                  >
                    {s.label}
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        </aside>

        {/* Content */}
        <div className="space-y-10 min-w-0">
          {/* Overview */}
          <Section id="overview" title="Overview">
            <div className="grid sm:grid-cols-2 gap-4">
              <InfoCard label="Method name">
                Level of free radical generation (ROS)
              </InfoCard>
              <InfoCard label="Cell line">
                EA.hy 926 (ATCC® CRL 2922)
              </InfoCard>
              <InfoCard label="Detection probe">
                6-carboxy-2&apos;,7&apos;-dichlorodihydrofluorescein diacetate
                (H2DCFDA)
              </InfoCard>
              <InfoCard label="Read-out">
                Fluorescence at 485 / 530 nm
              </InfoCard>
            </div>
          </Section>

          {/* Materials */}
          <Section id="materials" title="Materials needed">
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
              {MATERIALS.map((m, i) => (
                <li
                  key={i}
                  className="flex gap-3 px-4 py-3 text-sm text-slate-700"
                >
                  <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-blue-500" />
                  <span className="leading-relaxed">{m}</span>
                </li>
              ))}
            </ul>
          </Section>

          {/* Devices */}
          <Section id="devices" title="Needed devices and tools">
            <ul className="grid sm:grid-cols-2 gap-2">
              {DEVICES.map((d, i) => (
                <li
                  key={i}
                  className="flex items-center gap-2 rounded-md bg-white border border-slate-200 px-3 py-2 text-sm text-slate-700"
                >
                  <svg
                    className="h-4 w-4 flex-shrink-0 text-blue-500"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                  {d}
                </li>
              ))}
            </ul>
          </Section>

          {/* Sample prep */}
          <Section id="sample-prep" title="Preparation of sample for testing">
            <div className="rounded-lg bg-white border border-slate-200 p-4 text-sm text-slate-700 leading-relaxed">
              Sterile samples of nanomaterials.
              <span className="block mt-2 text-slate-500 italic">
                The sterilization method will be provided later.
              </span>
            </div>
          </Section>

          {/* Conditions */}
          <Section id="conditions" title="Experimental conditions">
            <div className="rounded-lg bg-blue-50 border border-blue-100 p-4 text-sm text-blue-900 leading-relaxed">
              Cells incubation — 37°C in a 5% CO₂ in humid air atmosphere.
            </div>
          </Section>

          {/* Procedure */}
          <Section id="procedure" title="Course of the experiment">
            <ol className="relative border-l-2 border-blue-100 ml-3 space-y-6">
              {PROCEDURE.map((step, i) => (
                <li key={i} className="relative pl-8">
                  <span className="absolute -left-[15px] flex h-7 w-7 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white ring-4 ring-slate-50">
                    {i + 1}
                  </span>
                  <p className="text-sm text-slate-700 leading-relaxed pt-1">
                    {step}
                  </p>
                </li>
              ))}
            </ol>
          </Section>

          {/* Data & analysis */}
          <Section id="data-analysis" title="Data & analysis">
            <div className="space-y-3">
              {DATA_ANALYSIS.map((d, i) => (
                <div
                  key={i}
                  className="rounded-lg bg-white border border-slate-200 p-4"
                >
                  <h3 className="text-sm font-semibold text-blue-800">
                    {d.heading}
                  </h3>
                  <p className="mt-1 text-sm text-slate-500 italic">{d.body}</p>
                </div>
              ))}
            </div>
          </Section>
        </div>
      </div>
    </main>
  );
}

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24">
      <h2 className="text-xl md:text-2xl font-bold text-blue-900 mb-4 pb-2 border-b border-slate-200">
        {title}
      </h2>
      {children}
    </section>
  );
}

function InfoCard({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg bg-white border border-slate-200 p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
        {label}
      </p>
      <p className="mt-1 text-sm text-slate-800 leading-relaxed">{children}</p>
    </div>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full bg-white/15 px-3 py-1 text-xs font-medium text-sky-50 ring-1 ring-white/20">
      {children}
    </span>
  );
}