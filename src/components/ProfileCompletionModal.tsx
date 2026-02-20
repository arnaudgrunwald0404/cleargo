"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Modal,
  Stack,
  Text,
  TextInput,
  Button,
  Avatar,
  FileButton,
  Group,
  Title,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { IconCheck, IconUpload } from '@tabler/icons-react';
import { createClient } from '@/lib/supabase/client';

export function ProfileCompletionModal() {
  const [opened, setOpened] = useState(false);
  const [saving, setSaving] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userFirstName, setUserFirstName] = useState<string | null>(null);
  const [userLastName, setUserLastName] = useState<string | null>(null);
  const [userAvatarUrl, setUserAvatarUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const supabase = createClient();

  const form = useForm({
    initialValues: {
      first_name: '',
      last_name: '',
      avatar_url: '',
    },
  });

  useEffect(() => {
    const fetchUserProfile = async () => {
      try {
        const res = await fetch("/api/me");
        if (!res.ok) {
          setLoading(false);
          return;
        }
        const data = await res.json();
        const user = data.user;
        
        setUserEmail(user?.email || null);
        setUserFirstName(user?.first_name || null);
        setUserLastName(user?.last_name || null);
        setUserAvatarUrl(user?.avatar_url || null);
        
        form.setValues({
          first_name: user?.first_name || '',
          last_name: user?.last_name || '',
          avatar_url: user?.avatar_url || '',
        });
      } catch (error) {
        console.error('Failed to fetch user profile:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchUserProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (loading) return;

    // Check if profile is incomplete
    const isIncomplete = !userFirstName || !userLastName || !userAvatarUrl;

    // Check if modal has been shown this session
    const modalShown = sessionStorage.getItem('profileCompletionModalShown') === 'true';

    // Only show if incomplete and not shown this session
    if (isIncomplete && !modalShown && userEmail) {
      setOpened(true);
    }
  }, [loading, userEmail, userFirstName, userLastName, userAvatarUrl]);

  const handleClose = () => {
    setOpened(false);
    // Mark as shown for this session
    sessionStorage.setItem('profileCompletionModalShown', 'true');
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      let avatarUrl = form.values.avatar_url;

      // Handle file upload if a file is selected
      if (file) {
        const fileExt = file.name.split('.').pop();
        const fileName = `${userEmail?.replace('@', '_') || 'unknown'}-${Math.random()}.${fileExt}`;
        const filePath = `${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('avatars')
          .upload(filePath, file);

        if (uploadError) {
          console.error("Upload error:", uploadError);
          notifications.show({
            title: "Upload Error",
            message: "Failed to upload image. Please try again.",
            color: "red",
          });
          throw uploadError;
        }

        const { data: { publicUrl } } = supabase.storage
          .from('avatars')
          .getPublicUrl(filePath);

        avatarUrl = publicUrl;
      }

      const res = await fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name: form.values.first_name,
          last_name: form.values.last_name,
          avatar_url: avatarUrl,
        }),
      });

      if (!res.ok) throw new Error("Failed to update profile");

      const updatedData = await res.json();
      const updatedUser = updatedData.user;

      // Update local state immediately
      setUserFirstName(updatedUser?.first_name || null);
      setUserLastName(updatedUser?.last_name || null);
      setUserAvatarUrl(avatarUrl || null);

      notifications.show({
        title: "Profile Updated",
        message: "Your profile has been updated successfully.",
        color: "green",
        icon: <IconCheck size={16} />,
      });

      handleClose();
      // Refresh to update header and other components
      router.refresh();
    } catch (error) {
      console.error(error);
      notifications.show({
        title: "Error",
        message: "Failed to update profile. Please try again.",
        color: "red",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSkip = () => {
    handleClose();
  };

  return (
    <Modal
      opened={opened}
      onClose={handleSkip}
      title={
        <Title order={3} style={{ fontFamily: 'var(--font-heading)' }}>
          Complete Your Profile
        </Title>
      }
      size="md"
      closeOnClickOutside={false}
      closeOnEscape={true}
    >
      <Stack gap="md">
        <Text size="sm" c="dimmed" style={{ fontFamily: 'var(--font-body)' }}>
          ClearGO works better when team members can be mentioned by name and recognized from their picture. 
          This helps with collaboration and makes the experience more personal.
        </Text>

        <form onSubmit={form.onSubmit(handleSave)}>
          <Stack gap="md">
            <Group gap="md" align="flex-start">
              <div style={{ flex: 1 }}>
                <TextInput
                  label="First Name"
                  placeholder="Enter your first name"
                  {...form.getInputProps('first_name')}
                  required
                  style={{ fontFamily: 'var(--font-body)' }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <TextInput
                  label="Last Name"
                  placeholder="Enter your last name"
                  {...form.getInputProps('last_name')}
                  required
                  style={{ fontFamily: 'var(--font-body)' }}
                />
              </div>
            </Group>

            <div>
              <Text size="sm" fw={500} mb="xs" style={{ fontFamily: 'var(--font-body)' }}>
                Profile Picture
              </Text>
              <Group gap="md">
                <Avatar
                  src={file ? URL.createObjectURL(file) : form.values.avatar_url || undefined}
                  alt={userEmail || 'User'}
                  size={64}
                  radius="xl"
                >
                  {form.values.first_name?.[0] || form.values.last_name?.[0] || userEmail?.[0] || 'U'}
                </Avatar>
                <FileButton onChange={setFile} accept="image/png,image/jpeg,image/jpg">
                  {(props) => (
                    <Button
                      {...props}
                      leftSection={<IconUpload size={16} />}
                      variant="light"
                      size="sm"
                    >
                      {file ? 'Change Picture' : 'Upload Picture'}
                    </Button>
                  )}
                </FileButton>
                {file && (
                  <Text size="xs" c="dimmed" style={{ fontFamily: 'var(--font-body)' }}>
                    {file.name}
                  </Text>
                )}
              </Group>
            </div>

            <Group justify="flex-end" mt="md">
              <Button variant="subtle" onClick={handleSkip} disabled={saving}>
                Maybe Later
              </Button>
              <Button
                type="submit"
                loading={saving}
                disabled={!form.values.first_name || !form.values.last_name}
              >
                Save Profile
              </Button>
            </Group>
          </Stack>
        </form>
      </Stack>
    </Modal>
  );
}
