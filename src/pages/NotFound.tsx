import { Link } from "react-router";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6 text-foreground">
      <p className="micro-label">404</p>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight sm:text-3xl">
        This page isn&apos;t in the pipeline.
      </h1>
      <p className="mt-3 max-w-md text-center text-sm leading-6 text-muted-foreground">
        The role you&apos;re looking for may have been filled — or the link was
        never part of your search.
      </p>
      <Button asChild className="mt-8 rounded-none">
        <Link to="/">Back to home</Link>
      </Button>
    </div>
  );
}
