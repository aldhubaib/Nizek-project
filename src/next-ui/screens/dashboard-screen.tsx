import { PageHeader } from "@/next-ui/patterns/page-header";
import { Badge } from "@/next-ui/ui/badge";
import { Button } from "@/next-ui/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/next-ui/ui/card";

/** The dashboard, as the file route and the pane router both render it. */
export function DashboardScreen() {
  return (
    <div>
      <PageHeader title="Dashboard" />

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <Badge variant="outline">Preview</Badge>
            <CardTitle>This is the new UI</CardTitle>
            <CardDescription>
              Colors, type, the shell and the panes come from Social AI&apos;s admin system.
              Nizek data and login stay the same.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              ⌥-click a sidebar item, or hover it and press the pane icon, to open it beside this
              one. Swap, open full or close a pane from its header. Screens arrive here one by
              one; a section that is not built yet says so.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>How to switch later</CardTitle>
            <CardDescription>
              When every screen people use is rebuilt, this shell becomes the default.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button disabled>Switch is not ready</Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
