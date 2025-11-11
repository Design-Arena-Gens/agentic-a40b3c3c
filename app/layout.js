export const metadata = {
  title: "Slow Motion",
  description: "Upload a video, play in slow motion, and export.",
};

import "./globals.css";

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
