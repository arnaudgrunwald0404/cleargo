"use client";

import { useState, useEffect, useMemo, useRef } from 'react';
import { TextInput, Box, Paper, Text, Group, Stack } from '@mantine/core';
import { IconSearch } from '@tabler/icons-react';
import Link from 'next/link';
import type { Epic } from '@/types/epics';

interface EpicSearchProps {
  epics?: Epic[];
  className?: string;
  fetchEpics?: boolean;
}

// Extract reference number from epic
function getReferenceNumber(epic: Epic): string {
  if (epic.aha_id) return epic.aha_id;
  if (epic.aha_fields && typeof epic.aha_fields === 'object') {
    const fields = epic.aha_fields as any;
    if (fields.standard_fields?.reference_num) {
      return fields.standard_fields.reference_num;
    }
  }
  return '-';
}

// Extract PM owner from epic
function getPMOwner(epic: Epic): string {
  // Try owner.name first
  if (epic.owner?.name) return epic.owner.name;
  // Try owner.email
  if (epic.owner?.email) return epic.owner.email;
  // Try owner_email
  if (epic.owner_email) return epic.owner_email;
  // Try aha_fields.standard_fields.assigned_to_user
  if (epic.aha_fields && typeof epic.aha_fields === 'object') {
    const fields = epic.aha_fields as any;
    if (fields.standard_fields?.assigned_to_user?.name) {
      return fields.standard_fields.assigned_to_user.name;
    }
    if (fields.standard_fields?.assigned_to_user?.email) {
      return fields.standard_fields.assigned_to_user.email;
    }
  }
  return '-';
}

// Format release date
function formatReleaseDate(date: string | null | undefined): string {
  if (!date) return '-';
  try {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  } catch {
    return '-';
  }
}

export function EpicSearch({ epics: providedEpics, className, fetchEpics = false }: EpicSearchProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [epics, setEpics] = useState<Epic[]>(providedEpics || []);
  const [loadingEpics, setLoadingEpics] = useState(fetchEpics);
  const searchRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Fetch epics if needed
  useEffect(() => {
    if (fetchEpics && providedEpics === undefined) {
      async function loadEpics() {
        try {
          const { fetchWithRateLimit } = await import('@/lib/fetch-with-rate-limit');
          const res = await fetchWithRateLimit('/api/epics', { credentials: 'include', maxRetries: 1 });
          if (res.ok) {
            const data = await res.json();
            setEpics(Array.isArray(data) ? data : []);
          }
        } catch (error) {
          console.error('Failed to fetch epics for search:', error);
        } finally {
          setLoadingEpics(false);
        }
      }
      loadEpics();
    } else if (providedEpics) {
      setEpics(providedEpics);
      setLoadingEpics(false);
    }
  }, [fetchEpics, providedEpics]);

  // Filter epics based on search query (minimum 3 characters)
  const filteredEpics = useMemo(() => {
    if (searchQuery.length < 3) return [];
    
    const query = searchQuery.toLowerCase().trim();
    return epics.filter(epic => {
      const nameMatch = epic.name.toLowerCase().includes(query);
      const refMatch = getReferenceNumber(epic).toLowerCase().includes(query);
      const ownerMatch = getPMOwner(epic).toLowerCase().includes(query);
      return nameMatch || refMatch || ownerMatch;
    }).slice(0, 10); // Limit to 10 results
  }, [searchQuery, epics]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [isOpen]);

  // Open dropdown when there are results
  useEffect(() => {
    setIsOpen(filteredEpics.length > 0 && searchQuery.length >= 3);
  }, [filteredEpics.length, searchQuery.length]);

  const handleInputChange = (value: string) => {
    setSearchQuery(value);
  };

  const handleResultClick = () => {
    setSearchQuery('');
    setIsOpen(false);
  };

  // Custom input styles for header (dark background)
  const isHeaderStyle = className?.includes('header-search') || fetchEpics;
  
  return (
    <Box ref={searchRef} style={{ position: 'relative' }} className={className}>
      <div style={{ position: 'relative', width: '100%' }}>
        <input
          ref={inputRef as any}
          type="text"
          placeholder="Search for epic"
          value={searchQuery}
          onChange={(e) => handleInputChange(e.currentTarget.value)}
          onFocus={() => {
            if (filteredEpics.length > 0 && searchQuery.length >= 3) {
              setIsOpen(true);
            }
          }}
          style={{
            width: '100%',
            height: isHeaderStyle ? '36px' : 'auto',
            padding: isHeaderStyle 
              ? 'var(--spacing-2) var(--spacing-4) var(--spacing-2) 36px'
              : undefined,
            borderRadius: 'var(--radius-md)',
            border: isHeaderStyle ? 'none' : undefined,
            backgroundColor: isHeaderStyle 
              ? 'rgba(255, 255, 255, 0.1)' 
              : undefined,
            color: isHeaderStyle ? 'var(--nav-text)' : undefined,
            fontSize: 'var(--font-size-base)',
            fontFamily: 'var(--font-body)',
            ...(isHeaderStyle ? {} : {
              paddingLeft: '36px',
              paddingRight: 'var(--spacing-3)',
              paddingTop: 'var(--spacing-2)',
              paddingBottom: 'var(--spacing-2)',
              border: '1px solid var(--color-gray-300)',
            })
          }}
          className={isHeaderStyle ? "placeholder-white placeholder-opacity-70" : undefined}
        />
        <IconSearch
          size={16}
          style={{
            position: 'absolute',
            left: '12px',
            top: '50%',
            transform: 'translateY(-50%)',
            color: isHeaderStyle ? 'var(--nav-text)' : 'var(--color-gray-500)',
            pointerEvents: 'none'
          }}
        />
      </div>

      {isOpen && filteredEpics.length > 0 && (
        <Paper
          shadow="md"
          p="xs"
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            zIndex: 10000,
            marginTop: '4px',
            maxHeight: '400px',
            overflowY: 'auto',
            backgroundColor: 'white',
            border: '1px solid var(--color-gray-200)',
            borderRadius: 'var(--radius-md)',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)'
          }}
        >
          <Stack gap={0}>
            {filteredEpics.map((epic) => (
              <Link
                key={epic.id}
                href={`/epics/${epic.id}`}
                onClick={handleResultClick}
                style={{ textDecoration: 'none', color: 'inherit' }}
              >
                <Box
                  p="sm"
                  style={{
                    cursor: 'pointer',
                    borderBottom: '1px solid var(--color-gray-100)',
                    transition: 'background-color 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'var(--color-gray-50)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                >
                  <Stack gap={4}>
                    <Text
                      size="sm"
                      fw={600}
                      style={{
                        fontFamily: 'var(--font-body)',
                        color: 'var(--color-gray-900)'
                      }}
                    >
                      {epic.name}
                    </Text>
                    <Group gap="md" style={{ flexWrap: 'wrap' }}>
                      <Text
                        size="xs"
                        style={{
                          fontFamily: 'var(--font-body)',
                          color: 'var(--color-gray-600)'
                        }}
                      >
                        <span style={{ fontWeight: 500 }}>Ref:</span> {getReferenceNumber(epic)}
                      </Text>
                      <Text
                        size="xs"
                        style={{
                          fontFamily: 'var(--font-body)',
                          color: 'var(--color-gray-600)'
                        }}
                      >
                        <span style={{ fontWeight: 500 }}>Release:</span> {formatReleaseDate(epic.target_launch_date)}
                      </Text>
                      <Text
                        size="xs"
                        style={{
                          fontFamily: 'var(--font-body)',
                          color: 'var(--color-gray-600)'
                        }}
                      >
                        <span style={{ fontWeight: 500 }}>PM:</span> {getPMOwner(epic)}
                      </Text>
                    </Group>
                  </Stack>
                </Box>
              </Link>
            ))}
          </Stack>
        </Paper>
      )}

      {isOpen && searchQuery.length >= 3 && filteredEpics.length === 0 && (
        <Paper
          shadow="md"
          p="md"
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            zIndex: 10000,
            marginTop: '4px',
            backgroundColor: 'white',
            border: '1px solid var(--color-gray-200)',
            borderRadius: 'var(--radius-md)'
          }}
        >
          <Text
            size="sm"
            style={{
              fontFamily: 'var(--font-body)',
              color: 'var(--color-gray-500)',
              textAlign: 'center'
            }}
          >
            No epics found
          </Text>
        </Paper>
      )}
    </Box>
  );
}

