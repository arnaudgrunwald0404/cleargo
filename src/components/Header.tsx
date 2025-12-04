"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { UserAvatar } from './UserAvatar';
import { Container, Group, Burger } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';

interface HeaderProps {
    email?: string | null;
    role?: string | null;
    imageUrl?: string | null;
}

export function Header({ email, role, imageUrl }: HeaderProps) {
    const pathname = usePathname();
    const [opened, { toggle }] = useDisclosure(false);

    const links = [
        { link: '/', label: 'Home' },
        { link: '/epics', label: 'Epics' },
        { link: '/meetings', label: 'Meetings' },
        { link: '/my-items', label: 'My Items' },
        { link: '/admin/settings', label: 'Settings' },
    ];

    const isActive = (path: string) => {
        if (path === '/' && pathname === '/') return true;
        if (path !== '/' && pathname?.startsWith(path)) return true;
        return false;
    };

    return (
        <header className="h-[60px] bg-white border-b border-gray-200 fixed top-0 left-0 right-0 z-[100] shadow-sm">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-full">
                <div className="flex justify-between items-center h-full">
                    {/* Left side: Logo and Nav */}
                    <div className="flex items-center gap-8">
                        {/* Logo */}
                        <Link href="/" className="flex items-center gap-2 no-underline text-gray-900 hover:text-indigo-600 transition-colors">
                            <div className="w-8 h-8 bg-gradient-to-br from-indigo-600 to-purple-600 rounded-lg flex items-center justify-center shadow-sm">
                                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                </svg>
                            </div>
                            <span className="font-bold text-xl tracking-tight">ClearGO</span>
                        </Link>

                        {/* Desktop Navigation */}
                        <nav className="hidden md:flex items-center gap-1">
                            {links.map((link) => (
                                <Link
                                    key={link.link}
                                    href={link.link}
                                    className={`px-3 py-2 rounded-md text-sm font-medium transition-all duration-200 ${isActive(link.link)
                                        ? 'bg-indigo-50 text-indigo-700'
                                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                                        }`}
                                >
                                    {link.label}
                                </Link>
                            ))}
                        </nav>
                    </div>

                    {/* Right side: User Avatar */}
                    <div className="flex items-center gap-4">
                        <UserAvatar email={email} role={role} imageUrl={imageUrl} />
                    </div>
                </div>
            </div>
        </header>
    );
}
