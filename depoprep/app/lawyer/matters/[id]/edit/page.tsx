"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import { MatterForm } from "@/app/lawyer/components/MatterForm";

export default function EditMatterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const matterId = id as Id<"matters">;
  const { user } = useAuth();
  const router = useRouter();
  const matter = useQuery(api.matters.getById, { id: matterId });
  const updateMatter = useMutation(api.matters.update);

  if (!matter) {
    return <div className="p-8 text-muted-foreground">Loading...</div>;
  }

  if (user && matter.lawyerId !== user._id) {
    return <div className="p-8 text-muted-foreground">Not authorized to edit this matter.</div>;
  }

  return (
    <MatterForm
      backHref={`/lawyer/matters/${matterId}`}
      cardTitle="Edit Matter"
      cardDescription="Update the case details and AI simulation parameters."
      submitLabel="Save Changes"
      loadingLabel="Saving..."
      initialValues={{
        title: matter.title,
        eventType: matter.eventType,
        eventDate: matter.eventDate,
        caseSummary: matter.caseSummary,
        persona: matter.persona,
        riskTags: matter.riskTags,
        customQuestions: matter.customQuestions ?? [],
      }}
      onSubmit={async (values) => {
        if (!user) return;
        try {
          await updateMatter({
            matterId,
            lawyerId: user._id,
            title: values.title,
            eventType: values.eventType,
            eventDate: values.eventDate,
            caseSummary: values.caseSummary,
            riskTags: values.riskTags,
            customQuestions: values.customQuestions.length > 0 ? values.customQuestions : undefined,
            persona: values.persona,
          });
          toast.success("Matter updated successfully");
          router.push(`/lawyer/matters/${matterId}`);
        } catch {
          toast.error("Failed to update matter");
        }
      }}
    />
  );
}
