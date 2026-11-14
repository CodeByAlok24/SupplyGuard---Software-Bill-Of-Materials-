import Link from "next/link";
import { Container } from "./Container";
import { Logo } from "./Logo";

const footerLinks = [
  { label: "Platform", href: "#platform" },
  { label: "Solutions", href: "#workflow" },
  { label: "Resources", href: "#standards" },
];

export function Footer() {
  return (
    <footer className="pt-4 pb-[38px]">
      <Container className="flex items-center justify-between gap-8 max-[700px]:flex-col max-[700px]:items-start max-[700px]:gap-[18px]">
        <Link href="/" aria-label="SupplyGuard home">
          <Logo
            gapClassName="gap-[7px]"
            markClassName="h-6 w-auto"
            textClassName="text-[15px]"
          />
        </Link>

        <nav
          aria-label="Footer navigation"
          className="flex flex-wrap items-center gap-[34px] max-[700px]:gap-5"
        >
          {footerLinks.map((link) => (
            <a
              key={link.label}
              href={link.href}
              className="text-[12.5px] font-medium text-muted transition-colors hover:text-brand-dark"
            >
              {link.label}
            </a>
          ))}
          <span aria-hidden="true" className="-mx-1 h-[18px] w-px bg-line" />
          <a
            href="/overview"
            className="text-[12.5px] font-medium text-muted transition-colors hover:text-brand-dark"
          >
            Log in
          </a>
        </nav>
      </Container>
    </footer>
  );
}
