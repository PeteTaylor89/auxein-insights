import Link from 'next/link';
import { Mail, MapPin, Linkedin, Youtube } from 'lucide-react';
import Image from 'next/image';

const footerLinks = {
  solutions: [
    { label: 'Auxein Insights Pro', href: '/insights-pro' },
    { label: 'Regional Intelligence', href: 'https://insights.auxein.co.nz', external: true },
    { label: 'Data Products', href: '/solutions#datasets' },
    { label: 'Consulting Services', href: '/solutions#consulting' },
  ],
  company: [
    { label: 'About', href: '/about' },
    { label: 'Contact', href: '/contact' },
    
  ],
  legal: [
    { label: 'Privacy Policy', href: '/privacy' },
    { label: 'Terms of Service', href: '/terms' },
  ],
};

export function Footer() {
  return (
    <footer className="bg-charcoal text-white">
      {/* Main Footer */}
      <div className="section-container py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12">
          {/* Brand Column */}
          <div className="lg:col-span-1">
            <Link href="/" className="inline-block mb-4">
              <Image
                src="/images/logo-square-rounded.jpg"
                alt="Auxein - to grow"
                width={140}
                height={57}
                className="h-12 w-auto brightness-0 invert"
              />
            </Link>
            <p className="text-charcoal-300 text-sm leading-relaxed mb-6">
              Leading the global wine industry toward a sustainable and
              resilient future, creating a legacy for generations.
            </p>
            <div className="flex items-center gap-4">
              <a
                href="https://linkedin.com/company/auxein-nz"
                target="_blank"
                rel="noopener noreferrer"
                className="text-charcoal-400 hover:text-olive-300 transition-colors"
                aria-label="LinkedIn"
              >
                <Linkedin className="w-5 h-5" />
              </a>

            </div>
          </div>

          {/* Solutions Column */}
          <div>
            <h3 className="text-lg font-semibold text-white mb-4">
              Solutions
            </h3>
            <ul className="space-y-3">
              {footerLinks.solutions.map((link) => (
                <li key={link.href}>
                  {link.external ? (
                    <a
                      href={link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-charcoal-300 hover:text-olive-300 transition-colors text-sm"
                    >
                      {link.label} ↗
                    </a>
                  ) : (
                    <Link
                      href={link.href}
                      className="text-charcoal-300 hover:text-olive-300 transition-colors text-sm"
                    >
                      {link.label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </div>

          {/* Company Column */}
          <div>
            <h3 className="text-lg font-semibold text-white mb-4">
              Company
            </h3>
            <ul className="space-y-3">
              {footerLinks.company.map((link) => (
                <li key={link.href}>
                  {link.external ? (
                    <a
                      href={link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-charcoal-300 hover:text-olive-300 transition-colors text-sm"
                    >
                      {link.label} ↗
                    </a>
                  ) : (
                    <Link
                      href={link.href}
                      className="text-charcoal-300 hover:text-olive-300 transition-colors text-sm"
                    >
                      {link.label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </div>

          {/* Contact Column */}
          <div>
            <h3 className="text-lg font-semibold text-white mb-4">
              Get in Touch
            </h3>
            <ul className="space-y-4">
              <li className="flex items-start gap-3">
                <Mail className="w-5 h-5 text-olive-400 shrink-0 mt-0.5" />
                <a
                  href="mailto:pete@auxein.co.nz"
                  className="text-charcoal-300 hover:text-olive-300 transition-colors text-sm"
                >
                  insights@auxein.co.nz
                </a>
              </li>
              <li className="flex items-start gap-3">
                <MapPin className="w-5 h-5 text-olive-400 shrink-0 mt-0.5" />
                <span className="text-charcoal-300 text-sm">
                  Christchurch, Canterbury
                  <br />
                  New Zealand
                </span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Bottom Bar */}
      <div className="border-t border-charcoal-700">
        <div className="section-container py-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-charcoal-400 text-sm">
              © {new Date().getFullYear()} Auxein Limited. All rights reserved.
            </p>
            <div className="flex items-center gap-6">
              {footerLinks.legal.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="text-charcoal-400 hover:text-charcoal-200 transition-colors text-sm"
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}