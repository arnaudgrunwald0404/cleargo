"use client";

import { createClient } from "@/lib/supabase/client";
import { Button, ButtonProps } from "@mantine/core";

interface SSOButtonProps extends Omit<ButtonProps, 'onClick'> {
  children: React.ReactNode;
}

export function SSOButton({ 
  children, 
  size = "md", 
  variant = "filled",
  fullWidth = false,
  className,
  style,
  ...props
}: SSOButtonProps) {
  const supabase = createClient();

  const handleClick = async () => {
    const redirectTo = `${window.location.origin}/auth/callback`;

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
        queryParams: {
          prompt: 'select_account',
        },
      },
    });

    if (error) {
      console.error('OAuth sign-in error:', error);
    }
  };

  return (
    <Button 
      onClick={handleClick} 
      size={size}
      variant={variant}
      fullWidth={fullWidth}
      className={className}
      style={style}
      {...props}
    >
      {children}
    </Button>
  );
}

