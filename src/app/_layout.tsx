import { ThemeProvider } from "@/components/theme-provider";
import { Stack } from "expo-router/stack";

export default function Layout() {
  return (
    <ThemeProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="gallery" options={{ presentation: "modal" }} />
      </Stack>
    </ThemeProvider>
  );
}
