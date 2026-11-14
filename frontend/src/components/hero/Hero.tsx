import { Button } from "../Button";
import { Container } from "../Container";
import { ArrowRightIcon } from "../Icons";
import { ProductPreview } from "./ProductPreview";

export function Hero() {
  return (
    <section className="relative overflow-hidden pt-[22px]">
      <span
        aria-hidden="true"
        style={{ clipPath: "polygon(0 0, 100% 14%, 72% 100%, 0 76%)" }}
        className="pointer-events-none absolute top-4 left-[-110px] h-[250px] w-[300px] -rotate-6 bg-gradient-to-br from-brand-tint to-brand-soft opacity-95 max-[960px]:opacity-50"
      />
      <span
        aria-hidden="true"
        style={{ clipPath: "polygon(26% 0, 100% 0, 100% 100%, 0 70%)" }}
        className="pointer-events-none absolute -top-4 right-[-120px] h-[350px] w-[430px] bg-gradient-to-br from-brand-tint to-brand-soft opacity-85 max-[960px]:opacity-40"
      />

      <Container className="relative z-10 text-center">
        <span className="inline-flex items-center rounded-full bg-brand-soft px-[17px] py-[7px] text-[10.5px] font-bold tracking-[0.09em] text-brand-dark uppercase max-[380px]:px-3.5 max-[380px]:text-[9px] max-[380px]:tracking-[0.06em]">
          Software supply chain, under control
        </span>

        <h1 className="mx-auto mt-[19px] max-w-[880px] font-display text-[clamp(40px,5.6vw,66px)] leading-[1.04] font-extrabold tracking-[-0.038em] text-ink-strong max-[700px]:text-[clamp(30px,9.8vw,52px)]">
          Every dependency.
          <br />
          Every obligation. In view.
        </h1>

        <p className="mx-auto mt-4 max-w-[545px] text-[17.5px] leading-[1.55] text-muted max-[700px]:max-w-[460px] max-[700px]:text-base">
          Create SBOMs and manage license and vulnerability risk across your
          software supply chain.
        </p>

        <div className="mt-[26px] flex justify-center gap-[15px] max-[480px]:mx-auto max-[480px]:max-w-[280px] max-[480px]:flex-col max-[480px]:items-stretch">
          <Button href="/overview">
            Get started
            <ArrowRightIcon className="mt-[-1px] h-[17px] w-[17px]" />
          </Button>
          <Button href="#platform" variant="ghost">
            View platform
          </Button>
        </div>

        <div className="mx-auto mt-[52px] max-w-[810px]">
          <ProductPreview />
        </div>

        <div
          id="standards"
          className="mt-[38px] flex flex-wrap items-center justify-center gap-8 pb-2 max-[700px]:mt-12 max-[700px]:gap-4 max-[480px]:gap-x-3 max-[480px]:gap-y-3"
        >
          <span className="flex items-center gap-4 max-[480px]:gap-3">
            <span className="text-[10.5px] font-semibold tracking-[0.14em] text-muted uppercase max-[700px]:text-[8.5px] max-[700px]:tracking-[0.1em]">
              Standards &amp; integrations
            </span>
            <span aria-hidden="true" className="h-[25px] w-px bg-line" />
          </span>
          <span className="flex items-center gap-8 max-[700px]:gap-4">
            <span className="font-display text-[17px] font-bold tracking-[-0.015em] text-ink max-[700px]:text-sm">
              SPDX
            </span>
            <span className="font-display text-[17px] font-bold tracking-[-0.015em] text-ink max-[700px]:text-sm">
              CycloneDX
            </span>
          </span>
        </div>
      </Container>
    </section>
  );
}
