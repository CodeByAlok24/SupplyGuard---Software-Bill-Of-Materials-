import { Container } from "./Container";

const stats = [
  { value: "36", label: "Projects", detail: "Actively monitored" },
  { value: "12.4k", label: "Components", detail: "In your software inventory" },
  { value: "94/100", label: "Posture", detail: "Overall security posture" },
];

export function Stats() {
  return (
    <section className="py-[52px] max-[700px]:py-10">
      <Container>
        <div className="grid grid-cols-3 max-[480px]:grid-cols-1 max-[480px]:gap-6">
          {stats.map((stat, index) => (
            <div
              key={stat.label}
              className={`px-5 py-1 text-center max-[700px]:px-2.5 ${
                index > 0
                  ? "border-l border-[#e9e3f2] max-[480px]:border-l-0"
                  : ""
              }`}
            >
              <p className="font-display text-[clamp(42px,4.5vw,50px)] leading-none font-extrabold tracking-[-0.035em] text-brand-dark max-[700px]:text-[32px]">
                {stat.value}
              </p>
              <p className="mt-2 text-[11.5px] font-bold tracking-[0.12em] text-ink uppercase max-[700px]:text-[9.5px] max-[700px]:tracking-[0.09em]">
                {stat.label}
              </p>
              <p className="mt-[3px] text-[13px] text-muted max-[700px]:text-[11px] max-[480px]:mx-auto max-[480px]:max-w-[200px]">
                {stat.detail}
              </p>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}
