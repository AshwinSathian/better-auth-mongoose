import { Hero } from "@/components/Hero";
import { Problem } from "@/components/Problem";
import { Comparison } from "@/components/Comparison";
import { Proof } from "@/components/Proof";
import { Packages } from "@/components/Packages";
import { Recipes } from "@/components/Recipes";
import { Compatibility } from "@/components/Compatibility";
import { Faq } from "@/components/Faq";
import { faqItems } from "@/lib/content";

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqItems.map((item) => ({
    "@type": "Question",
    name: item.question,
    acceptedAnswer: {
      "@type": "Answer",
      text: item.answer,
    },
  })),
};

export default function HomePage() {
  return (
    <>
      <script
        type="application/ld+json"
        // Generated from the same static faqItems array rendered below, not user input.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <Hero />
      <Problem />
      <Comparison />
      <Proof />
      <Packages />
      <Recipes />
      <Compatibility />
      <Faq />
    </>
  );
}
