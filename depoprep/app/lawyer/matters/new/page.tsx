"use client";

import { useRouter } from "next/navigation";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import { MatterForm } from "@/app/lawyer/components/MatterForm";

export default function NewMatterPage() {
  const { user } = useAuth();
  const router = useRouter();
  const createMatter = useMutation(api.matters.create);

  return (
    <MatterForm
      backHref="/lawyer/matters"
      cardTitle="Create New Matter"
      cardDescription="Configure the case details and AI simulation parameters."
      submitLabel="Create Matter"
      loadingLabel="Creating..."
      onSubmit={async (values) => {
        if (!user) return;
        try {
          const id = await createMatter({
            lawyerId: user._id,
            title: values.title,
            eventType: values.eventType,
            eventDate: values.eventDate,
            caseSummary: values.caseSummary,
            riskTags: values.riskTags,
            customQuestions: values.customQuestions.length > 0 ? values.customQuestions : undefined,
            persona: values.persona,
          });
          toast.success("Matter created successfully");
          router.push(`/lawyer/matters/${id}`);
        } catch {
          toast.error("Failed to create matter");
        }
      }}
    />
  );
}
