import { Card, CardContent } from "@/components/ui/card";
import { Construction } from "lucide-react";

export function ComingSoon({ title, description }: { title: string; description: string }) {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
      <Card className="animate-rise">
        <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Construction className="h-7 w-7" />
          </span>
          <p className="max-w-sm text-muted-foreground">{description}</p>
        </CardContent>
      </Card>
    </div>
  );
}
