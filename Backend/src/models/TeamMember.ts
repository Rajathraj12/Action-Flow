import mongoose, { Document, Schema, Types } from "mongoose";

export type TeamRole = "TEAM_LEAD" | "MEMBER";

export interface ITeamMember extends Document {
  workspaceId: Types.ObjectId;
  teamId: Types.ObjectId;
  userId: Types.ObjectId;
  role: TeamRole;
  joinedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const TeamMemberSchema = new Schema<ITeamMember>(
  {
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
      index: true,
    },
    teamId: {
      type: Schema.Types.ObjectId,
      ref: "Team",
      required: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    role: {
      type: String,
      enum: ["TEAM_LEAD", "MEMBER"],
      default: "MEMBER",
      required: true,
    },
    joinedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Prevent duplicate team membership records
TeamMemberSchema.index({ teamId: 1, userId: 1 }, { unique: true });
// Optimize listing teams for a user
TeamMemberSchema.index({ workspaceId: 1, userId: 1 });

export const TeamMember = mongoose.model<ITeamMember>("TeamMember", TeamMemberSchema);
