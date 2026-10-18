import mongoose, { Document, Schema, Types } from "mongoose";

export interface ITeam extends Document {
  workspaceId: Types.ObjectId;
  name: string;
  description: string;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const TeamSchema = new Schema<ITeam>(
  {
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 80,
    },
    description: {
      type: String,
      trim: true,
      default: "",
      maxlength: 500,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// Team names should be unique within a workspace
TeamSchema.index({ workspaceId: 1, name: 1 }, { unique: true });

export const Team = mongoose.model<ITeam>("Team", TeamSchema);
