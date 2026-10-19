"use client";

import { use, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import Link from "next/link";
import { ArrowLeft, Users, Plus, X, FileText, CheckCircle, Clock, Pencil } from "lucide-react";
import { PERSONAS } from "@/app/lawyer/components/MatterForm";
import { scoreColor } from "@/components/simulation/SessionFeedbackPanel";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ClientTrainingProgress } from "@/app/lawyer/components/ClientTrainingProgress";
import { RemoveMatterButton } from "@/app/lawyer/components/RemoveMatterButton";

export default function MatterDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const matterId = id as Id<"matters">;

  const matter = useQuery(api.matters.getById, { id: matterId });
  const clients = useQuery(api.matters.getClientsForMatter, { matterId });
  const allClients = useQuery(api.users.getAllClients, {});
  const sessions = useQuery(api.simSessions.listByMatter, { matterId });
  const feedbackList = useQuery(api.simFeedback.listByMatter, { matterId });
  const scoreBySession = new Map(feedbackList?.map((f) => [f.sessionId, f.readinessScore]));
  const addClient = useMutation(api.matters.addClient);
  const removeClient = useMutation(api.matters.removeClient);

  const [addDialogOpen, setAddDialogOpen] = useState(false);

  const clientIds = new Set(clients?.map((c) => c?._id.toString()));
  const availableClients = allClients?.filter((c) => !clientIds.has(c._id.toString()));

  const handleAddClient = async (clientId: Id<"users">) => {
    try {
      await addClient({ matterId, clientId });
      toast.success("Client added to matter");
      setAddDialogOpen(false);
    } catch {
      toast.error("Failed to add client");
    }
  };

  const handleRemoveClient = async (clientId: Id<"users">) => {
    try {
      await removeClient({ matterId, clientId });
      toast.success("Client removed");
    } catch {
      toast.error("Failed to remove client");
    }
  };

  if (!matter) return <div className="p-8 text-muted-foreground">Loading...</div>;

  const personaLabel = PERSONAS.find((p) => p.value === matter.persona)?.label ?? matter.persona;

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <Link href="/lawyer/matters" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-6">
        <ArrowLeft className="w-4 h-4 mr-1" />
        Back to Matters
      </Link>

      {/* Matter Header */}
      <div className="mb-8">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-3xl font-bold">{matter.title}</h1>
              <Badge variant="secondary" className="capitalize">{matter.eventType.replace("_", " ")}</Badge>
            </div>
            <p className="text-muted-foreground">Event date: {matter.eventDate}</p>
          </div>
          <div className="flex items-center gap-2">
            <Link href={`/lawyer/matters/${matterId}/edit`}>
              <Button variant="outline">
                <Pencil className="w-4 h-4 mr-2" /> Edit Matter
              </Button>
            </Link>
            <RemoveMatterButton
              matterId={matterId}
              matterTitle={matter.title}
              variant="destructive"
            />
          </div>
        </div>

        <div className="mt-4 p-4 bg-muted/50 rounded-lg">
          <h3 className="text-sm font-semibold mb-2">Case Summary</h3>
          <p className="text-sm text-muted-foreground">{matter.caseSummary}</p>
        </div>

        {matter.riskTags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="text-xs text-muted-foreground font-medium">Risk areas:</span>
            {matter.riskTags.map((tag) => (
              <span key={tag} className="text-xs bg-red-50 text-red-700 border border-red-200 px-2 py-0.5 rounded-full">{tag}</span>
            ))}
          </div>
        )}

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="p-4 bg-muted/50 rounded-lg">
            <h3 className="text-sm font-semibold mb-1">Counsel Style</h3>
            <p className="text-sm text-muted-foreground">{personaLabel}</p>
          </div>
          <div className="p-4 bg-muted/50 rounded-lg">
            <h3 className="text-sm font-semibold mb-1">Practice Questions</h3>
            {matter.customQuestions && matter.customQuestions.length > 0 ? (
              <ol className="text-sm text-muted-foreground list-decimal list-inside space-y-1">
                {matter.customQuestions.map((q, idx) => (
                  <li key={idx}>{q}</li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-amber-600">No questions added — clients cannot start simulations until questions are added.</p>
            )}
          </div>
        </div>
      </div>

      <Separator className="mb-8" />

      {/* Clients */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Users className="w-5 h-5" /> Assigned Clients
          </h2>
          <>
            <Button size="sm" variant="outline" onClick={() => setAddDialogOpen(true)}>
              <Plus className="w-4 h-4 mr-2" /> Add Client
            </Button>
            <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Client to Matter</DialogTitle>
                </DialogHeader>
                {!availableClients || availableClients.length === 0 ? (
                  <p className="text-muted-foreground text-sm">No unassigned clients available. Ask clients to register on PrepBuddy first.</p>
                ) : (
                  <div className="space-y-2 mt-2">
                    {availableClients.map((client) => (
                      <div key={client._id} className="flex items-center justify-between p-3 border rounded-lg">
                        <div>
                          <p className="font-medium text-sm">{client.name}</p>
                          <p className="text-xs text-muted-foreground">{client.email}</p>
                        </div>
                        <Button size="sm" onClick={() => handleAddClient(client._id)}>Add</Button>
                      </div>
                    ))}
                  </div>
                )}
              </DialogContent>
            </Dialog>
          </>
        </div>

        {!clients || clients.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="p-8 text-center text-muted-foreground">
              No clients assigned yet. Add a client to get started.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {clients.map((client) => {
              if (!client) return null;
              const clientSessions = sessions?.filter((s) => s.clientId === client._id) ?? [];
              const completedSessions = clientSessions.filter((s) => s.status === "completed");

              return (
                <Card key={client._id}>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold">
                          {client.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-semibold">{client.name}</p>
                          <p className="text-sm text-muted-foreground">{client.email}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-center">
                          <p className="text-sm font-medium">{completedSessions.length}/{clientSessions.length}</p>
                          <p className="text-xs text-muted-foreground">Sessions</p>
                        </div>
                        {completedSessions.length > 0 && (
                          <Link href={`/lawyer/matters/${matterId}/session/${completedSessions[completedSessions.length - 1]._id}`}>
                            <Button variant="outline" size="sm">
                              <FileText className="w-4 h-4 mr-1" /> Last Session
                            </Button>
                          </Link>
                        )}
                        <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => handleRemoveClient(client._id)}>
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                    <ClientTrainingProgress clientId={client._id} />
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Sessions */}
      <div>
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <FileText className="w-5 h-5" /> All Sessions
        </h2>
        {!sessions || sessions.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="p-8 text-center text-muted-foreground">
              No simulation sessions yet. Clients will start sessions from their portal.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {[...sessions].reverse().map((session) => (
              <Card key={session._id}>
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {session.status === "completed" ? (
                      <CheckCircle className="w-5 h-5 text-green-500" />
                    ) : (
                      <Clock className="w-5 h-5 text-amber-500" />
                    )}
                    <div>
                      <p className="text-sm font-medium capitalize">{session.status} session</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(session.startedAt).toLocaleDateString()} · {session.transcript.length} messages
                      </p>
                    </div>
                  </div>
                  {session.status === "completed" && (
                    <div className="flex items-center gap-4">
                      {scoreBySession.has(session._id) && (
                        <div className="text-right">
                          <p className={`text-2xl font-bold leading-none ${scoreColor(scoreBySession.get(session._id)!)}`}>
                            {scoreBySession.get(session._id)}
                          </p>
                          <p className="text-xs text-muted-foreground">Readiness</p>
                        </div>
                      )}
                      <Link href={`/lawyer/matters/${matterId}/session/${session._id}`}>
                        <Button variant="outline" size="sm">View Transcript</Button>
                      </Link>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
