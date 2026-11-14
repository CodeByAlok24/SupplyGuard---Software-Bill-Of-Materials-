import { Container } from "./Container";
import { CheckIcon } from "./Icons";

const steps = [
  {
    title: "Connect",
    description:
      "Link your code and build sources to ingest dependencies automatically.",
    done: false,
  },
  {
    title: "Review",
    description:
      "See your SBOM, license obligations, and vulnerabilities in one place.",
    done: false,
  },
  {
    title: "Resolve",
    description: "Remediate risk, apply policy, and ship with confidence.",
    done: true,
  },
];

export function Workflow() {
  return (
    <section
      id="workflow"
      className="bg-gradient-to-b from-brand-tint to-brand-soft py-16 max-[820px]:py-14"
    >
      <Container className="grid grid-cols-[1fr_1.04fr] items-center gap-[76px] max-[960px]:gap-12 max-[820px]:grid-cols-1 max-[820px]:gap-[34px]">
        <div>
          <span
            aria-hidden="true"
            className="block h-1.5 w-[58px] rounded-[3px] bg-gradient-to-r from-[#6ee7a8] to-[#b4f0cc]"
          />
          <h2 className="mt-6 font-display text-[clamp(34px,4.6vw,44px)] leading-[1.08] font-extrabold tracking-[-0.035em] text-ink-strong">
            Turn inventory
            <br />
            into action.
          </h2>
          <p className="mt-4 max-w-[395px] text-base leading-[1.6] text-muted max-[820px]:max-w-[520px]">
            Go from a complete software inventory to actionable remediation with
            a simple, repeatable workflow.
          </p>
        </div>

        <div className="rounded-[14px] border border-line bg-panel p-[22px_26px] [box-shadow:0_30px_60px_-42px_rgba(53,17,116,0.4)] max-[480px]:p-5">
          <ol className="flex flex-col">
            {steps.map((step, index) => (
              <li
                key={step.title}
                className="relative flex gap-4 pb-[19px] last:pb-0"
              >
                {index < steps.length - 1 ? (
                  <span
                    aria-hidden="true"
                    className="absolute top-[30px] bottom-0.5 left-[13px] w-0.5 rounded-[2px] bg-line"
                  />
                ) : null}

                <span
                  className={`relative z-[1] flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                    step.done
                      ? "bg-brand text-white [box-shadow:0_6px_14px_-6px_rgba(110,32,230,0.7)]"
                      : "bg-oksoft text-mint"
                  }`}
                >
                  <CheckIcon className="h-[17px] w-[17px]" />
                </span>

                <div className="pt-px">
                  <h3 className="text-[15px] font-bold tracking-[-0.015em] text-ink">
                    {step.title}
                  </h3>
                  <p className="mt-[3px] text-[13.5px] leading-[1.55] text-muted">
                    {step.description}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </Container>
    </section>
  );
}
