import { ReactNode } from "react";
import { motion } from "framer-motion";
import { useLocation } from "wouter";
import { Button } from "@/components/Button";
import { Home } from "lucide-react";

export function Layout({ children }: { children: ReactNode }) {
  const [location, setLocation] = useLocation();
  const isHome = location === "/";

  return (
    <div className="min-h-screen w-full px-4 py-8 md:py-12">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="max-w-4xl mx-auto"
      >
        <header className="mb-12 text-center">
          <div className="flex justify-end mb-2 min-h-[36px]">
            {!isHome && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setLocation("/")}
                data-testid="button-new-game"
              >
                <Home className="w-4 h-4 mr-1" /> New Game
              </Button>
            )}
          </div>
          <h1 className="text-5xl md:text-7xl font-bold text-primary mb-2 drop-shadow-sm tracking-tight">
            90sure
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground font-medium">
            How sure are you?
          </p>
        </header>
        <main>
          {children}
        </main>
      </motion.div>
    </div>
  );
}
