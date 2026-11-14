import { Cta } from "@/components/Cta";
import { Features } from "@/components/Features";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { Hero } from "@/components/hero/Hero";
import { Stats } from "@/components/Stats";
import { Workflow } from "@/components/Workflow";

export default function Home() {
  return (
    <>
      <Header />
      <main>
        <Hero />
        <Features />
        <Workflow />
        <Stats />
        <Cta />
      </main>
      <Footer />
    </>
  );
}
