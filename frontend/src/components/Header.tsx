import Link from "next/link";
import { Button } from "./Button";
import { Container } from "./Container";
import { ChevronDownIcon } from "./Icons";
import { Logo } from "./Logo";
import { ThemeToggle } from "./ThemeToggle";

const navigation = [
  { label: "Platform", href: "#platform" },
  { label: "Solutions", href: "#workflow" },
  { label: "Resources", href: "#standards" },
];

export function Header() {
  return (
    <header className="relative z-20 py-[18px]">
      <Container className="flex items-center gap-6 max-[700px]:gap-3">
        <Link href="/" aria-label="SupplyGuard home" className="shrink-0">
          <Logo
            markClassName="h-11 w-auto max-[700px]:h-9"
            textClassName="text-[21px] max-[700px]:text-[18px]"
          />
        </Link>

        <nav
          aria-label="Main navigation"
          className="mx-auto flex items-center gap-[34px] max-[960px]:gap-[22px] max-[860px]:hidden"
        >
          {navigation.map((item) => (
            <a
              key={item.label}
              href={item.href}
              className="group inline-flex items-center gap-1.5 text-sm font-medium text-ink-soft transition-colors hover:text-brand-dark"
            >
              {item.label}
              <ChevronDownIcon className="h-[13px] w-[13px] text-muted-light transition-transform group-hover:translate-y-px" />
            </a>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-[22px] max-[700px]:gap-3.5">
          <ThemeToggle className="max-[380px]:h-8 max-[380px]:w-8" />
          <a
            href="/login"
            className="text-sm font-medium text-ink-soft transition-colors hover:text-brand-dark max-[480px]:hidden"
          >
            Log in
          </a>
          <Button href="/overview" size="sm">
            Get started
          </Button>
        </div>
      </Container>
    </header>
  );
}
