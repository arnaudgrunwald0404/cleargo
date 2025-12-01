"use client";

import { useState, useEffect } from "react";
import { TextInput, Button, Avatar, FileButton, Group, Text, Loader, Paper, Title, Container } from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { IconUpload, IconCheck } from "@tabler/icons-react";

import { createClient } from "@/lib/supabase/client";

export default function AccountPage() {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [user, setUser] = useState<any>(null);
    const [file, setFile] = useState<File | null>(null);
    const supabase = createClient();

    const form = useForm({
        initialValues: {
            first_name: "",
            last_name: "",
            avatar_url: "",
        },
    });

    useEffect(() => {
        fetchProfile();
    }, []);

    const fetchProfile = async () => {
        try {
            const res = await fetch("/api/me");
            if (!res.ok) throw new Error("Failed to fetch profile");
            const data = await res.json();
            setUser(data.user);
            form.setValues({
                first_name: data.user.first_name || "",
                last_name: data.user.last_name || "",
                avatar_url: data.user.avatar_url || "",
            });
        } catch (error) {
            console.error(error);
            notifications.show({
                title: "Error",
                message: "Failed to load profile",
                color: "red",
            });
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async (values: typeof form.values) => {
        setSaving(true);
        try {
            let avatarUrl = values.avatar_url;

            // Handle file upload if a file is selected
            if (file) {
                const fileExt = file.name.split('.').pop();
                const fileName = `${user?.id || 'unknown'}-${Math.random()}.${fileExt}`;
                const filePath = `${fileName}`;

                const { error: uploadError } = await supabase.storage
                    .from('avatars')
                    .upload(filePath, file);

                if (uploadError) {
                    console.error("Upload error:", uploadError);
                    if (uploadError.message.includes("Bucket not found")) {
                        notifications.show({
                            title: "Storage Error",
                            message: "The 'avatars' storage bucket does not exist. Please contact an administrator.",
                            color: "red"
                        });
                        throw new Error("Storage bucket not found");
                    }
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
                    first_name: values.first_name,
                    last_name: values.last_name,
                    avatar_url: avatarUrl
                }),
            });

            if (!res.ok) throw new Error("Failed to update profile");

            const data = await res.json();
            setUser(data.user);
            notifications.show({
                title: "Success",
                message: "Profile updated successfully",
                color: "green",
                icon: <IconCheck size={16} />,
            });
            // Refresh to update header
            window.location.reload();
        } catch (error) {
            console.error(error);
            notifications.show({
                title: "Error",
                message: "Failed to update profile. Ensure the 'avatars' bucket exists and is public.",
                color: "red",
            });
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="flex justify-center items-center min-h-[50vh]">
                <Loader size="lg" />
            </div>
        );
    }

    return (
        <Container size="sm" py="xl">
            <Paper shadow="sm" radius="md" p="xl" withBorder>
                <Title order={2} mb="lg">Account Details</Title>

                <form onSubmit={form.onSubmit(handleSave)}>
                    <Group mb="xl" align="center">
                        <Avatar
                            src={file ? URL.createObjectURL(file) : form.values.avatar_url}
                            size={100}
                            radius={100}
                            color="initials"
                        >
                            {user?.first_name?.[0]}{user?.last_name?.[0]}
                        </Avatar>
                        <div>
                            <FileButton onChange={setFile} accept="image/png,image/jpeg">
                                {(props) => <Button {...props} variant="default" leftSection={<IconUpload size={14} />}>Upload new picture</Button>}
                            </FileButton>
                            <Text size="xs" c="dimmed" mt="xs">
                                Allowed types: png, jpeg. Max size: 5MB
                            </Text>
                        </div>
                    </Group>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                        <TextInput
                            label="First Name"
                            placeholder="John"
                            {...form.getInputProps("first_name")}
                        />
                        <TextInput
                            label="Last Name"
                            placeholder="Doe"
                            {...form.getInputProps("last_name")}
                        />
                    </div>

                    <TextInput
                        label="Email"
                        value={user?.email || ""}
                        disabled
                        description="Email cannot be changed"
                        mb="lg"
                    />

                    <Group justify="flex-end">
                        <Button type="submit" loading={saving}>
                            Save Changes
                        </Button>
                    </Group>
                </form>
            </Paper>
        </Container>
    );
}
