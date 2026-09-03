'use client';

import React from 'react';
import Link from 'next/link';
import { useTranslation } from '@/hooks/useTranslation';
import SiteBrand from '@/components/layout/SiteBrand';
import { 
  ChevronRight, 
  ShieldCheck, 
  Award, 
  IndianRupee, 
  Headphones, 
  Phone, 
  Mail, 
  MapPin 
} from 'lucide-react';

export default function Footer() {
  const { t } = useTranslation();

  return (
    <footer className="bg-[#1A1A1A] text-gray-300 pt-16 pb-6 px-6 md:px-12 w-full mt-auto border-t-[10px] border-[#E6E6E6]">
      <div className="max-w-[1200px] mx-auto">
        {/* Top Grid */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-10 md:gap-8 mb-12 md:mb-16">
          
          {/* Column 1: Brand & Features */}
          <div className="col-span-1 md:col-span-4 flex flex-col items-start pr-0 md:pr-4 lg:pr-8">
            <div className="mb-6 relative z-10 w-full max-w-[200px]">
              <SiteBrand variant="footer" align="left" />
            </div>
            <p className="text-sm md:text-[13px] text-[#B3B3B3] leading-relaxed mb-8">
              India&apos;s trusted marketplace for buying and selling JCB and heavy construction machines. Verified dealers. Fair prices. Reliable deals.
            </p>
            
            {/* Features Icons */}
            <div className="grid grid-cols-4 gap-2 w-full max-w-[320px]">
              <div className="flex flex-col items-center text-center group">
                <div className="mb-2 text-[#F0C85C] group-hover:text-white transition-colors duration-300">
                  <ShieldCheck size={24} strokeWidth={1.5} />
                </div>
                <span className="text-[10px] text-[#8C8C8C] leading-tight">Verified<br/>Dealers</span>
              </div>
              <div className="flex flex-col items-center text-center group">
                <div className="mb-2 text-[#F0C85C] group-hover:text-white transition-colors duration-300">
                  <Award size={24} strokeWidth={1.5} />
                </div>
                <span className="text-[10px] text-[#8C8C8C] leading-tight">Quality<br/>Assured</span>
              </div>
              <div className="flex flex-col items-center text-center group">
                <div className="mb-2 text-[#F0C85C] group-hover:text-white transition-colors duration-300">
                  <IndianRupee size={24} strokeWidth={1.5} />
                </div>
                <span className="text-[10px] text-[#8C8C8C] leading-tight">Best Market<br/>Prices</span>
              </div>
              <div className="flex flex-col items-center text-center group">
                <div className="mb-2 text-[#F0C85C] group-hover:text-white transition-colors duration-300">
                  <Headphones size={24} strokeWidth={1.5} />
                </div>
                <span className="text-[10px] text-[#8C8C8C] leading-tight">Dedicated<br/>Support</span>
              </div>
            </div>
          </div>

          {/* Vertical Divider (Desktop only) */}
          <div className="hidden md:flex col-span-1 justify-center">
            <div className="border-r border-[#333333] h-[90%]"></div>
          </div>

          {/* Column 2: Quick Links */}
          <div className="col-span-1 md:col-span-2">
            <h4 className="text-white text-[12px] font-bold tracking-[0.05em] uppercase mb-6 flex flex-col">
              QUICK LINKS
              <span className="w-6 h-[2px] bg-[#F0C85C] mt-3"></span>
            </h4>
            <ul className="space-y-4">
              <li>
                <Link href="/" className="group flex items-center text-[13px] text-[#B3B3B3] hover:text-white transition-colors">
                  <ChevronRight size={14} className="text-[#F0C85C] mr-2 group-hover:translate-x-1 transition-transform" />
                  Home
                </Link>
              </li>
              <li>
                <Link href="/machines" className="group flex items-center text-[13px] text-[#B3B3B3] hover:text-white transition-colors">
                  <ChevronRight size={14} className="text-[#F0C85C] mr-2 group-hover:translate-x-1 transition-transform" />
                  Machines
                </Link>
              </li>
              <li>
                <Link href="#" className="group flex items-center text-[13px] text-[#B3B3B3] hover:text-white transition-colors">
                  <ChevronRight size={14} className="text-[#F0C85C] mr-2 group-hover:translate-x-1 transition-transform" />
                  Sell Vehicle
                </Link>
              </li>
              <li>
                <Link href="/sold-vehicles" className="group flex items-center text-[13px] text-[#B3B3B3] hover:text-white transition-colors">
                  <ChevronRight size={14} className="text-[#F0C85C] mr-2 group-hover:translate-x-1 transition-transform" />
                  Sold Vehicles
                </Link>
              </li>
              <li>
                <Link href="/dealers" className="group flex items-center text-[13px] text-[#B3B3B3] hover:text-white transition-colors">
                  <ChevronRight size={14} className="text-[#F0C85C] mr-2 group-hover:translate-x-1 transition-transform" />
                  Find a Dealer
                </Link>
              </li>
            </ul>
          </div>

          {/* Vertical Divider (Desktop only) */}
          <div className="hidden md:flex col-span-1 justify-center">
            <div className="border-r border-[#333333] h-[90%]"></div>
          </div>

          {/* Column 3: Company */}
          <div className="col-span-1 md:col-span-1">
            <h4 className="text-white text-[12px] font-bold tracking-[0.05em] uppercase mb-6 flex flex-col">
              COMPANY
              <span className="w-6 h-[2px] bg-[#F0C85C] mt-3"></span>
            </h4>
            <ul className="space-y-4">
              <li>
                <Link href="#" className="group flex items-center text-[13px] text-[#B3B3B3] hover:text-white transition-colors">
                  <ChevronRight size={14} className="text-[#F0C85C] mr-2 group-hover:translate-x-1 transition-transform" />
                  About Us
                </Link>
              </li>
              <li>
                <Link href="#" className="group flex items-center text-[13px] text-[#B3B3B3] hover:text-white transition-colors">
                  <ChevronRight size={14} className="text-[#F0C85C] mr-2 group-hover:translate-x-1 transition-transform" />
                  Contact Us
                </Link>
              </li>
            </ul>
          </div>

          {/* Vertical Divider (Desktop only) */}
          <div className="hidden md:flex col-span-1 justify-center">
            <div className="border-r border-[#333333] h-[90%]"></div>
          </div>

          {/* Column 4: Contact */}
          <div className="col-span-1 md:col-span-2">
            <h4 className="text-white text-[12px] font-bold tracking-[0.05em] uppercase mb-6 flex flex-col">
              CONTACT
              <span className="w-6 h-[2px] bg-[#F0C85C] mt-3"></span>
            </h4>
            
            <div className="flex flex-col space-y-6">
              {/* Phone */}
              <div className="flex items-start group cursor-default">
                <div className="flex-shrink-0 w-9 h-9 rounded-full border border-[#333333] flex items-center justify-center mr-4 group-hover:border-[#F0C85C] group-hover:bg-[#F0C85C]/10 transition-colors">
                  <Phone size={14} className="text-[#F0C85C]" />
                </div>
                <div className="flex flex-col justify-center min-h-[36px]">
                  <p className="text-[13px] text-white font-medium leading-none">+91 1800 123 4567</p>
                  <p className="text-[11px] text-[#8C8C8C] mt-1.5 leading-none">Mon - Sat: 9:00 AM - 6:00 PM</p>
                </div>
              </div>
              
              {/* Divider */}
              <div className="w-full h-px bg-[#333333]"></div>

              {/* Email */}
              <div className="flex items-start group cursor-default">
                <div className="flex-shrink-0 w-9 h-9 rounded-full border border-[#333333] flex items-center justify-center mr-4 group-hover:border-[#F0C85C] group-hover:bg-[#F0C85C]/10 transition-colors">
                  <Mail size={14} className="text-[#F0C85C]" />
                </div>
                <div className="flex flex-col justify-center min-h-[36px]">
                  <p className="text-[13px] text-white font-medium leading-none">hello@jcbexchange.com</p>
                  <p className="text-[11px] text-[#8C8C8C] mt-1.5 leading-none">We&apos;ll get back to you</p>
                </div>
              </div>

              {/* Divider */}
              <div className="w-full h-px bg-[#333333]"></div>

              {/* Address */}
              <div className="flex items-start group cursor-default">
                <div className="flex-shrink-0 w-9 h-9 rounded-full border border-[#333333] flex items-center justify-center mr-4 group-hover:border-[#F0C85C] group-hover:bg-[#F0C85C]/10 transition-colors">
                  <MapPin size={14} className="text-[#F0C85C]" />
                </div>
                <div className="flex flex-col justify-center min-h-[36px]">
                  <p className="text-[12px] text-[#8C8C8C] leading-[1.4] pr-2">
                    JCB Exchange, Plot No. 23,<br/>
                    Sector 18, Gurugram,<br/>
                    Haryana 122015, India
                  </p>
                </div>
              </div>
            </div>
          </div>

        </div>

        {/* Bottom Bar */}
        <div className="pt-6 border-t border-[#333333] flex flex-col lg:flex-row justify-between items-center space-y-4 lg:space-y-0 text-[12px] text-[#8C8C8C]">
          
          <div className="flex flex-col sm:flex-row items-center text-center sm:text-left">
            <span>&copy; 2025–2026 JCB Exchange. All rights reserved.</span>
            <span className="hidden sm:inline mx-2">|</span>
            <span className="mt-2 sm:mt-0 flex items-center justify-center">
              Crafted with <span className="text-red-500 mx-1 text-[16px] leading-none">❤️</span> by <a href="https://webitof.com/" target="_blank" rel="noopener noreferrer" className="underline hover:text-white transition-colors ml-1">Webitof</a>
            </span>
          </div>

          <div className="flex items-center space-x-6">
            <Link href="#" className="hover:text-white transition-colors">Privacy Policy</Link>
            <Link href="#" className="hover:text-white transition-colors">Terms &amp; Conditions</Link>
          </div>

          <div className="flex items-center space-x-4">
            <span className="mr-2">Follow us on</span>
            <Link href="#" className="w-7 h-7 rounded-full bg-[#262626] flex items-center justify-center hover:bg-[#F0C85C] hover:text-black transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg>
            </Link>
            <Link href="#" className="w-7 h-7 rounded-full bg-[#262626] flex items-center justify-center hover:bg-[#F0C85C] hover:text-black transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="20" x="2" y="2" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" x2="17.51" y1="6.5" y2="6.5"/></svg>
            </Link>
            <Link href="#" className="w-7 h-7 rounded-full bg-[#262626] flex items-center justify-center hover:bg-[#F0C85C] hover:text-black transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33 2.78 2.78 0 0 0 1.94 2c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.33 29 29 0 0 0-.46-5.33z"/><polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02"/></svg>
            </Link>
            <Link href="#" className="w-7 h-7 rounded-full bg-[#262626] flex items-center justify-center hover:bg-[#F0C85C] hover:text-black transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect width="4" height="12" x="2" y="9"/><circle cx="4" cy="4" r="2"/></svg>
            </Link>
          </div>

        </div>
      </div>
    </footer>
  );
}
