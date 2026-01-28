'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, X } from 'lucide-react';
import { clsx } from 'clsx';

const navLinks = [
  { href: '/', label: 'Home' },
  { href: '/about', label: 'About' },
  { href: '/solutions', label: 'Solutions' },
  { href: '/contact', label: 'Contact' },
];

export function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <header
      className={clsx(
        'fixed top-0 left-0 right-0 z-50 transition-all duration-300',
        isScrolled
          ? 'bg-white/95 backdrop-blur-md shadow-sm border-b border-olive/10'
          : 'bg-transparent'
      )}
    >
      <nav className="section-container">
        <div className="flex items-center justify-between h-16 md:h-20">
          {/* Logo */}
          <Link
            href="/"
            className="flex items-center"
            aria-label="Auxein Home"
          >
            <Image
              src="/images/logo-full.png"
              alt="Auxein - to grow"
              width={140}
              height={57}
              className="h-10 md:h-20 w-auto"
              priority
            />
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="btn-ghost text-sm"
              >
                {link.label}
              </Link>
            ))}
            <div className="w-px h-6 bg-olive/20 mx-2" />
            <Link
              href="https://insights.auxein.co.nz"
              className="btn-ghost text-sm text-olive"
              target="_blank"
              rel="noopener noreferrer"
            >
              Regional Insights
            </Link>
            <Link href="/insights-pro" className="btn-primary text-sm ml-2">
              Insights Pro
            </Link>
          </div>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="md:hidden p-2 text-charcoal hover:text-olive transition-colors"
            aria-label={isOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={isOpen}
          >
            {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </nav>

      {/* Mobile Navigation */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="md:hidden bg-white border-b border-olive/10 overflow-hidden"
          >
            <div className="section-container py-4 space-y-1">
              {navLinks.map((link, i) => (
                <motion.div
                  key={link.href}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                >
                  <Link
                    href={link.href}
                    onClick={() => setIsOpen(false)}
                    className="block py-3 px-4 text-charcoal hover:text-olive hover:bg-sand rounded-lg transition-colors"
                  >
                    {link.label}
                  </Link>
                </motion.div>
              ))}
              <div className="border-t border-olive/10 my-2 pt-2">
                <Link
                  href="https://insights.auxein.co.nz"
                  onClick={() => setIsOpen(false)}
                  className="block py-3 px-4 text-olive hover:bg-sand rounded-lg transition-colors"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Regional Insights →
                </Link>
                <Link
                  href="/insights-pro"
                  onClick={() => setIsOpen(false)}
                  className="block py-3 px-4 mt-2 bg-olive text-white text-center rounded-lg hover:bg-olive-600 transition-colors"
                >
                  Insights Pro
                </Link>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}