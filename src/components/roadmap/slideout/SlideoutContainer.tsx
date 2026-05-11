'use client';

import { ActionIcon, Drawer, Group, ScrollArea, Stack, Text } from '@mantine/core';
import { IconArrowLeft } from '@tabler/icons-react';
import { useSlideout } from './SlideoutContext';

/**
 * Renders the top entry of the slideout stack as a Mantine Drawer.
 * Should be mounted once per page (alongside the page content).
 */
export function SlideoutContainer() {
  const { stack, isOpen, pop, close } = useSlideout();
  const top = stack.length > 0 ? stack[stack.length - 1] : null;
  const canGoBack = stack.length > 1;

  return (
    <Drawer
      opened={isOpen}
      onClose={close}
      position="right"
      size="lg"
      padding="md"
      withCloseButton={false}
      overlayProps={{ backgroundOpacity: 0.35, blur: 2 }}
      scrollAreaComponent={ScrollArea.Autosize}
      title={
        top ? (
          <Group gap="xs" wrap="nowrap" align="center">
            {canGoBack && (
              <ActionIcon
                variant="subtle"
                color="gray"
                size="sm"
                onClick={pop}
                aria-label="Back"
              >
                <IconArrowLeft size={16} />
              </ActionIcon>
            )}
            <Stack gap={4}>
              <Text fw={500} size="md" lh={1.35} c="gray.9">
                {top.title}
              </Text>
              {top.description && (
                <Text size="xs" c="dimmed" lh={1.4}>
                  {top.description}
                </Text>
              )}
            </Stack>
          </Group>
        ) : null
      }
      styles={{
        header: { borderBottom: '1px solid var(--color-gray-200)', paddingBottom: 12 },
        body: { paddingTop: 16 },
      }}
    >
      {top ? top.render() : null}
    </Drawer>
  );
}
