"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { createProject } from "@/actions/project";

export default function OnboardingPage() {
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const today = new Date().toISOString().split("T")[0];
  const oneYearLater = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);

    const formData = new FormData(e.currentTarget);

    try {
      const project = await createProject({
        name: name.trim(),
        contract: {
          label: "Initial Contract",
          startDate: formData.get("startDate") as string,
          endDate: formData.get("endDate") as string,
        },
      });
      router.push(`/dashboard/projects/${project.id}`);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-primary">
            <span className="text-lg font-bold text-primary-foreground">N</span>
          </div>
          <CardTitle className="text-xl">Create your first project</CardTitle>
          <CardDescription>
            A project is where your team collaborates on tasks.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Project Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Mobile App Redesign"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="startDate">Start Date</Label>
                <Input
                  id="startDate"
                  name="startDate"
                  type="date"
                  required
                  defaultValue={today}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="endDate">End Date</Label>
                <Input
                  id="endDate"
                  name="endDate"
                  type="date"
                  required
                  defaultValue={oneYearLater}
                />
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={loading || !name.trim()}>
              {loading ? "Creating..." : "Create Project"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
