import { Button } from "./Button";
import { Container } from "./Container";
import { ArrowRightIcon } from "./Icons";

export function Cta() {
  return (
    <section id="cta" className="pb-8">
      <Container>
        <div className="relative isolate overflow-hidden rounded-[18px] bg-[#1c1922] px-10 pt-11 pb-[42px] text-center max-[700px]:px-[22px] max-[700px]:pt-[52px] max-[700px]:pb-[46px]">
          <span
            aria-hidden="true"
            style={{ clipPath: "polygon(0 0, 58% 0, 0 100%)" }}
            className="absolute -top-px -left-px -z-10 h-[175px] w-[280px] bg-gradient-to-br from-[#8e3af7] via-[#7a22ef] to-[#6a15e0] opacity-95 max-[700px]:h-[170px] max-[700px]:w-[230px]"
          />
          <span
            aria-hidden="true"
            style={{ clipPath: "polygon(100% 100%, 100% 0, 0 100%)" }}
            className="absolute -right-px -bottom-px -z-10 h-[185px] w-[280px] bg-gradient-to-bl from-[#8e3af7] via-[#701ce8] to-[#5b10c9] max-[700px]:h-[180px] max-[700px]:w-[280px]"
          />

          <h2 className="font-display text-[clamp(30px,4vw,42px)] leading-[1.1] font-extrabold tracking-[-0.035em] text-white">
            Make your next release
            <br />
            your clearest one.
          </h2>

          <Button href="/register" size="cta" className="mt-5">
            Get started
            <ArrowRightIcon className="mt-[-1px] h-[17px] w-[17px]" />
          </Button>
        </div>
      </Container>
    </section>
  );
}
