"use client"
import Link from "next/link";
import Image from "next/image";
import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import ChangePasswordModal from "@/components/modals/ChangePasswordModal";

export default function Header() {
  const { user, logout } = useAuth();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isUserDropdownOpen, setIsUserDropdownOpen] = useState(false);
  const [isChangePasswordModalOpen, setIsChangePasswordModalOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsUserDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    console.log("Searching for:", searchQuery);
    // You would typically redirect to a search page or trigger search here
  };

  const handleLogout = async () => {
    try {
      await logout();
      setIsUserDropdownOpen(false);
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  const handleChangePassword = () => {
    setIsChangePasswordModalOpen(true);
    setIsUserDropdownOpen(false);
  };

  return (
    <header className="bg-sky-100 shadow-sm">
      {/* Top bar with newsletter and social links */}
      {/* <div className="w-full bg-white">
        <div className="max-w-7xl mx-auto px-4 py-2 flex flex-row items-center justify-between">
          <div className="w-full flex items-center space-x-4">
            <p className="text-xs text-blue-800 text-left">
              IMPLEMENTING INNOVATIVE METHODS FOR SAFETY AND SUSTAINABILITY ASSESSMENTS OF CHEMICALS AND MATERIALS PARTICULARLY AT NANO LEVEL IN THE EUROPEAN EU
            </p>
            <a href="#" className="text-xs font-medium text-green-600 hover:text-green-700">
              NEWSLETTER
            </a>
            <div className="flex flex-col xl:flex-row items-center xl:space-x-3">
              <a
                href="https://www.youtube.com/@chematsustain"
                className="text-gray-600 hover:text-gray-800 transition-colors"
                aria-label="YouTube"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" className="fill-current">
                  <path d="M21.8,8.001c0,0-0.195-1.378-0.795-1.985c-0.76-0.797-1.613-0.801-2.004-0.847c-2.799-0.202-6.997-0.202-6.997-0.202 h-0.009c0,0-4.198,0-6.997,0.202C4.608,5.216,3.756,5.22,2.995,6.016C2.395,6.623,2.2,8.001,2.2,8.001S2,9.62,2,11.238v1.517 c0,1.618,0.2,3.237,0.2,3.237s0.195,1.378,0.795,1.985c0.761,0.797,1.76,0.771,2.205,0.855c1.6,0.153,6.8,0.201,6.8,0.201 s4.203-0.006,7.001-0.209c0.391-0.047,1.243-0.051,2.004-0.847c0.6-0.607,0.795-1.985,0.795-1.985s0.2-1.618,0.2-3.237v-1.517 C22,9.62,21.8,8.001,21.8,8.001z M9.935,14.594l-0.001-5.62l5.404,2.82L9.935,14.594z"></path>
                </svg>
              </a>
              <a
                href="https://www.linkedin.com/company/chematsustain/"
                className="text-gray-600 hover:text-gray-800 transition-colors"
                aria-label="LinkedIn"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" className="fill-current">
                  <path d="M19.7,3H4.3C3.582,3,3,3.582,3,4.3v15.4C3,20.418,3.582,21,4.3,21h15.4c0.718,0,1.3-0.582,1.3-1.3V4.3 C21,3.582,20.418,3,19.7,3z M8.339,18.338H5.667v-8.59h2.672V18.338z M7.004,8.574c-0.857,0-1.549-0.694-1.549-1.548 c0-0.855,0.691-1.548,1.549-1.548c0.854,0,1.547,0.694,1.547,1.548C8.551,7.881,7.858,8.574,7.004,8.574z M18.339,18.338h-2.669 v-4.177c0-0.996-0.017-2.278-1.387-2.278c-1.389,0-1.601,1.086-1.601,2.206v4.249h-2.667v-8.59h2.559v1.174h0.037 c0.356-0.675,1.227-1.387,2.526-1.387c2.703,0,3.203,1.779,3.203,4.092V18.338z"></path>
                </svg>
              </a>
            </div>
          </div>
          <div className="">

          </div>
        </div>
      </div> */}

      {/* Main navigation */}
      <nav className="max-w-7xl mx-auto px-4 py-3 flex flex-col md:flex-row items-center justify-between">
        {/* Logo and mobile menu button */}
        <div className="flex items-center justify-between w-full md:w-auto">
          <Link href="/" className="flex items-center">
            <Image
              src="https://chematsustain.eu/wp-content/uploads/2024/03/CMS-Logo-horizontal-color-transp.png"
              alt="Chematsustain Logo"
              width={200}
              height={60}
              className="h-auto w-48 md:w-56"
              priority
            />
          </Link>

          {/* Mobile menu button (hidden on desktop) */}
          <button
            type="button"
            className="md:hidden p-2 text-blue-900 rounded-md"
            aria-label="Toggle menu"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>

        {/* Navigation links */}
        <div className={"md:flex items-center space-x-4 mt-4 md:mt-0" + (isMenuOpen ? "flex" : " hidden")}>
          <NavLink href="/">Home</NavLink>

          <DropdownMenu title="Selected chemicals & nanomaterials (CNM's) data">
            <DropdownItem href="/cnm">List of CNMs</DropdownItem>
            <DropdownItem href="/data">Experimental Data</DropdownItem>
            <DropdownItem href="/analytics">Protocols</DropdownItem>
          </DropdownMenu>
          <NavLink href="/prediction">Prediction model (QSAR)</NavLink>

          

          <NavLink href="/help">Help</NavLink>

          {/* Search Form */}
          <form onSubmit={handleSearch} className="relative">
            <input
              type="text"
              placeholder="Search..."
              className="pl-4 pr-10 py-2 border border-blue-900 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-blue-900"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <button
              type="submit"
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-blue-900 hover:text-blue-600"
              aria-label="Search"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </button>
          </form>

          {/* User Dropdown - Show only if user is logged in */}
          {user && (
            <div className="relative" ref={dropdownRef}>
              <button
                type="button"
                className="flex items-center px-3 py-2 text-sm font-medium text-blue-900 hover:bg-blue-50 rounded-md transition-colors"
                onClick={() => setIsUserDropdownOpen(!isUserDropdownOpen)}
                aria-expanded={isUserDropdownOpen}
              >
                <svg
                  className="w-5 h-5 mr-2"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                  />
                </svg>
                {user.email}
                <svg
                  className="ml-1 h-4 w-4 text-blue-600 transition-transform"
                  style={{ transform: isUserDropdownOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>

              {isUserDropdownOpen && (
                <div className="absolute right-0 mt-2 w-48 origin-top-right rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none z-10">
                  <div className="py-1">
                    <div className="px-4 py-2 text-xs text-gray-500 border-b">
                      Signed in as {user.role}
                    </div>
                    {user.role === 'admin' && (
                      <Link
                        href="/backoffice"
                        className="block px-4 py-2 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-900 transition-colors"
                        onClick={() => setIsUserDropdownOpen(false)}
                      >
                        <svg
                          className="w-4 h-4 mr-2 inline"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                          />
                        </svg>
                        Back Office
                      </Link>
                    )}
                    <button
                      onClick={handleChangePassword}
                      className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-900 transition-colors"
                    >
                      <svg
                        className="w-4 h-4 mr-2 inline"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1721 9z"
                        />
                      </svg>
                      Change Password
                    </button>
                    <button
                      onClick={handleLogout}
                      className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-red-50 hover:text-red-900 transition-colors"
                    >
                      <svg
                        className="w-4 h-4 mr-2 inline"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                        />
                      </svg>
                      Logout
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Login Link - Show only if user is not logged in */}
          {!user && (
            <NavLink href="/login">Login</NavLink>
          )}
        </div>
      </nav>

      {/* Change Password Modal */}
      <ChangePasswordModal
        isOpen={isChangePasswordModalOpen}
        onClose={() => setIsChangePasswordModalOpen(false)}
      />
    </header>
  );
}

// Component for regular navigation links
function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="px-3 py-2 text-sm font-medium text-blue-900 hover:bg-blue-50 rounded-md transition-colors whitespace-nowrap"
    >
      {children}
    </Link>
  );
}

// Component for dropdown menus
function DropdownMenu({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="relative group">
      <button
        type="button"
        className="flex items-center px-3 py-2 text-sm font-medium text-blue-900 hover:bg-blue-50 rounded-md transition-colors"
        aria-expanded="false"
      >
        {title}
        <svg
          className="ml-1 h-4 w-4 text-blue-600 group-hover:text-blue-800 transition-colors"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      <div className="absolute left-0 mt-2 w-56 origin-top-right rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-10">
        <div className="py-1">
          {children}
        </div>
      </div>
    </div>
  );
}

// Component for dropdown items
function DropdownItem({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="block px-4 py-2 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-900 transition-colors"
    >
      {children}
    </Link>
  );
}
