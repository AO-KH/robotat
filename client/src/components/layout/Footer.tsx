import { Link } from "wouter";
import { useDemoModal } from "@/features/booking/DemoModalContext";

import logo from "@assets/Robtat_by_Nasl_Logo-02_1771961617038.png";

const COLUMNS: { heading: string; links: { label: string; href: string }[] }[] = [
  {
    heading: "Robots",
    links: [
      { label: "Capabilities", href: "/#capabilities" },
      { label: "Products", href: "/fleet" },
      { label: "Services", href: "/services" },
    ],
  },
  {
    heading: "Customers",
    links: [
      { label: "Sign in", href: "/auth" },
      { label: "Dashboard", href: "/dashboard" },
    ],
  },
  {
    heading: "Company",
    links: [
      { label: "About NASL", href: "https://nasl-tech.com/en/about-us/" },
      { label: "News", href: "https://nasl-tech.com/en/blog/" },
    ],
  },
];

export function Footer() {
  const { openModal } = useDemoModal();

  return (
    <footer className="border-t border-border mt-8 pb-24 md:pb-0">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-16">
        <div className="grid grid-cols-2 md:grid-cols-[1.4fr_1fr_1fr_1fr] gap-10">
          <div className="col-span-2 md:col-span-1">
            <img
              src={logo}
              alt="ROBOTAT by NASL"
              className="h-12 w-auto object-contain drop-shadow-[0_0_14px_rgba(168,85,247,0.35)] mb-4"
            />
            <p className="text-[14px] text-muted-foreground leading-relaxed max-w-xs">
              Automating the essential for human growth — robotics and AI services.
            </p>
          </div>

          {COLUMNS.map((col) => (
            <div key={col.heading}>
              <h4 className="eyebrow mb-4">{col.heading}</h4>
              <ul className="space-y-2.5">
                {col.links.map((link) =>
                  link.href.startsWith("http") ? (
                    <li key={link.label}>
                      <a
                        href={link.href}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[14px] text-muted-foreground hover:text-foreground transition-colors py-1 inline-block"
                      >
                        {link.label}
                      </a>
                    </li>
                  ) : (
                    <li key={link.label}>
                      <Link
                        href={link.href}
                        className="text-[14px] text-muted-foreground hover:text-foreground transition-colors py-1 inline-block"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ),
                )}
                {col.heading === "Company" && (
                  <li>
                    <button
                      onClick={openModal}
                      className="text-[14px] text-muted-foreground hover:text-foreground transition-colors py-1"
                    >
                      Contact
                    </button>
                  </li>
                )}
              </ul>
            </div>
          ))}
        </div>

        <div className="flex flex-col md:flex-row justify-between items-center gap-3 mt-12 pt-6 border-t border-border">
          <span className="font-mono text-[11px] tracking-[0.08em] text-muted-foreground">
            © 2026 NASL Technologies. ROBOTAT is a NASL company.
          </span>
          <span className="font-mono text-[11px] tracking-[0.08em] text-[#c084fc]">
            robotat.nasl-tech.com
          </span>
        </div>
      </div>
    </footer>
  );
}
