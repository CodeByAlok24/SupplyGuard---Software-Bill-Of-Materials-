import { Container } from "./Container";
import { FileTextIcon, LayersIcon, ShieldCheckIcon } from "./Icons";

const features = [
  {
    title: "SBOM generation",
    description:
      "Create accurate, standards-compliant SBOMs (SPDX or CycloneDX) for every project.",
    icon: LayersIcon,
  },
  {
    title: "License intelligence",
    description:
      "Identify, analyze, and manage open source licenses to stay compliant with your policies.",
    icon: FileTextIcon,
  },
  {
    title: "Vulnerability prioritization",
    description:
      "Detect vulnerabilities across dependencies, assess real risk, and focus on what to fix first.",
    icon: ShieldCheckIcon,
  },
];

export function Features() {
  return (
    <section
      id="platform"
      className="border-t border-line-soft pt-[58px] pb-[54px] max-[700px]:pt-12 max-[700px]:pb-10"
    >
      <Container>
        <h2 className="max-w-[780px] font-display text-[clamp(31px,4.2vw,42px)] leading-[1.14] font-extrabold tracking-[-0.03em] text-ink-strong">
          Everything you need to ship responsibly.
        </h2>

        <div className="mt-7 grid grid-cols-3 gap-5 max-[820px]:grid-cols-1 max-[820px]:gap-3.5">
          {features.map((feature) => {
            const Icon = feature.icon;

            return (
              <article
                key={feature.title}
                className="rounded-[13px] border border-line bg-surface p-[21px_22px_23px] [box-shadow:0_1px_2px_rgba(25,21,36,0.03)] transition-[transform,border-color,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-[#ddccfb] hover:[box-shadow:0_18px_34px_-24px_rgba(58,24,120,0.3)]"
              >
                <span className="inline-flex h-[50px] w-[50px] items-center justify-center rounded-[10px] bg-panel-deep text-brand-dark">
                  <Icon className="h-6 w-6" />
                </span>
                <h3 className="mt-[17px] font-display text-base font-bold tracking-[-0.015em] text-ink">
                  {feature.title}
                </h3>
                <p className="mt-[7px] text-[13.5px] leading-[1.58] text-muted">
                  {feature.description}
                </p>
              </article>
            );
          })}
        </div>
      </Container>
    </section>
  );
}
