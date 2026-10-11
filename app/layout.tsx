import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "PETs Model",
  description: "Explore privacy-enhancing technologies and your use case in one conversation.",
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <meta name="theme-color" content="#ffffff" />
        <link rel="stylesheet" href="/styles.css" />
      </head>
      <body>{children}</body>
    </html>
  );
}
