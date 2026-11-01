import { Types } from "mongoose";
import { User, IUser } from "../models/User.js";
import { Workspace, IWorkspace } from "../models/Workspace.js";
import { WorkspaceMember, WorkspaceRole } from "../models/WorkspaceMember.js";
import { Conversation, IConversation, getDirectDmKey } from "../models/Conversation.js";
import { ConversationMembership } from "../models/ConversationMembership.js";
import { Message } from "../models/Message.js";
import { Task } from "../models/Task.js";
import { Notification } from "../models/Notification.js";

export interface DemoTeamMember {
  email: string;
  displayName: string;
  role: WorkspaceRole;
  title: string;
}

export const DEMO_TEAM_MEMBERS: DemoTeamMember[] = [
  {
    email: "rajath@actionflow.com",
    displayName: "Rajath",
    role: "OWNER",
    title: "Founder & Lead Architect",
  },
  {
    email: "ankit@actionflow.com",
    displayName: "Ankit",
    role: "ADMIN",
    title: "Engineering Director",
  },
  {
    email: "harsha@actionflow.com",
    displayName: "Harsha",
    role: "MANAGER",
    title: "Product & Engineering Manager",
  },
  {
    email: "chirag@actionflow.com",
    displayName: "Chirag",
    role: "MEMBER",
    title: "Fullstack Engineer",
  },
  {
    email: "harsh@actionflow.com",
    displayName: "Harsh",
    role: "MEMBER",
    title: "QA & Systems Engineer",
  },
];

export async function seedDemoTeam(): Promise<void> {
  try {
    console.log("[SeedDemoTeam] Initializing Soul Business Solutions team and collaboration data...");

    // 0. Clean up transient test users and mock users (e.g. Dan, Alice, Bob, Charlie)
    const canonicalEmails = DEMO_TEAM_MEMBERS.map((m) => m.email.toLowerCase());
    const mockUsers = await User.find({
      email: { $nin: canonicalEmails },
    });

    if (mockUsers.length > 0) {
      const mockUserIds = mockUsers.map((u) => u._id);
      console.log(`[SeedDemoTeam] Cleaning ${mockUsers.length} mock/test users from MongoDB (${mockUsers.map((u) => u.displayName || u.email).join(", ")})...`);
      await User.deleteMany({ _id: { $in: mockUserIds } });
      await WorkspaceMember.deleteMany({ userId: { $in: mockUserIds } });
      await ConversationMembership.deleteMany({ userId: { $in: mockUserIds } });
      await Task.deleteMany({
        $or: [{ createdBy: { $in: mockUserIds } }, { assigneeId: { $in: mockUserIds } }],
      });
      await Message.deleteMany({ sender: { $in: mockUserIds } });
      await Notification.deleteMany({ userId: { $in: mockUserIds } });
    }

    const testWorkspaces = await Workspace.find({
      $or: [
        { name: /^(phase\d*|test\d*)\s*workspace/i },
        { name: /^Charlie Private Workspace/i },
        { name: /^(Alpha Product|Beta External|Engineering Team|Marketing Team)\s*\d+/i },
        { name: /Soul Business Solutions\s+\d+/i },
      ],
    });

    if (testWorkspaces.length > 0) {
      const testWsIds = testWorkspaces.map((w) => w._id);
      console.log(`[SeedDemoTeam] Cleaning ${testWorkspaces.length} leftover test workspaces from MongoDB...`);
      await Workspace.deleteMany({ _id: { $in: testWsIds } });
      await WorkspaceMember.deleteMany({ workspaceId: { $in: testWsIds } });
      await Conversation.deleteMany({ workspaceId: { $in: testWsIds } });
      await ConversationMembership.deleteMany({ workspaceId: { $in: testWsIds } });
      await Message.deleteMany({ workspaceId: { $in: testWsIds } });
      await Task.deleteMany({ workspaceId: { $in: testWsIds } });
      await Notification.deleteMany({ workspaceId: { $in: testWsIds } });
    }

    // 1. Locate or create primary workspace: Soul Business Solutions
    let workspace = await Workspace.findOne({ name: "Soul Business Solutions" });
    if (!workspace) {
      workspace = await Workspace.create({
        name: "Soul Business Solutions",
        slug: "soul-business-solutions",
      });
      console.log(`[SeedDemoTeam] Created workspace: "${workspace.name}" (${workspace._id})`);
    }

    // Clean up any remaining non-canonical members in Soul Business Solutions workspace
    const canonicalUsers = await User.find({ email: { $in: canonicalEmails } });
    const canonicalUserIds = canonicalUsers.map((u) => u._id);
    await WorkspaceMember.deleteMany({
      workspaceId: workspace._id,
      userId: { $nin: canonicalUserIds },
    });

    // 2. Ensure each demo team member exists in User collection
    const userMap = new Map<string, IUser>();

    for (const member of DEMO_TEAM_MEMBERS) {
      let user = await User.findOne({ email: member.email.toLowerCase() });
      if (!user) {
        user = await User.create({
          email: member.email.toLowerCase(),
          displayName: member.displayName,
          firebaseUid: `firebase-${member.displayName.toLowerCase()}`,
          role: member.title,
          initials: member.displayName.slice(0, 2).toUpperCase(),
          online: false,
          lastSeen: new Date(),
        });
        console.log(`[SeedDemoTeam] Created user: ${user.email} (${user.displayName})`);
      } else {
        // Keep display name and title current
        if (!user.displayName || user.displayName !== member.displayName) {
          user.displayName = member.displayName;
          user.initials = member.displayName.slice(0, 2).toUpperCase();
        }
        user.role = member.title;
        await user.save();
      }
      userMap.set(member.email.toLowerCase(), user);

      // Ensure active workspace membership in Soul Business Solutions
      await WorkspaceMember.findOneAndUpdate(
        {
          workspaceId: workspace._id,
          userId: user._id,
        },
        {
          $set: {
            role: member.role,
            status: "ACTIVE",
          },
          $setOnInsert: {
            joinedAt: new Date(),
          },
        },
        { upsert: true, new: true }
      );
    }

    const allUserIds = DEMO_TEAM_MEMBERS.map((m) => userMap.get(m.email.toLowerCase())!._id);
    const rajath = userMap.get("rajath@actionflow.com")!;
    const ankit = userMap.get("ankit@actionflow.com")!;
    const chirag = userMap.get("chirag@actionflow.com")!;
    const harsha = userMap.get("harsha@actionflow.com")!;
    const harsh = userMap.get("harsh@actionflow.com")!;

    // 3. Ensure Group Conversation 1: "General Team" (All 5 members)
    let generalGroup = await Conversation.findOne({
      workspaceId: workspace._id,
      type: "GROUP",
      name: "General Team",
    });

    if (!generalGroup) {
      generalGroup = await Conversation.create({
        workspaceId: workspace._id,
        type: "GROUP",
        name: "General Team",
        description: "Soul Business Solutions company-wide announcements and team collaboration",
        createdBy: rajath._id,
        admins: [rajath._id, ankit._id],
        participants: allUserIds,
        participantIds: allUserIds,
      });
      console.log(`[SeedDemoTeam] Created group conversation: "${generalGroup.name}"`);
    } else {
      // Ensure all 5 are in participants array
      generalGroup.participants = allUserIds;
      generalGroup.participantIds = allUserIds;
      await generalGroup.save();
    }

    // Ensure ConversationMembership for all 5 users in General Team
    for (const member of DEMO_TEAM_MEMBERS) {
      const u = userMap.get(member.email.toLowerCase())!;
      const isGroupAdmin = member.role === "OWNER" || member.role === "ADMIN";
      await ConversationMembership.findOneAndUpdate(
        {
          conversationId: generalGroup._id,
          userId: u._id,
        },
        {
          $set: {
            workspaceId: workspace._id,
            firebaseUid: u.firebaseUid,
            role: isGroupAdmin ? "GROUP_ADMIN" : "MEMBER",
            status: "ACTIVE",
          },
          $setOnInsert: {
            joinedAt: new Date(),
            unreadCount: 0,
            lastReadAt: new Date(),
          },
        },
        { upsert: true }
      );
    }

    // Seed messages in General Team if empty
    const generalMsgCount = await Message.countDocuments({ conversationId: generalGroup._id });
    if (generalMsgCount === 0) {
      const generalMessages = [
        {
          sender: rajath,
          text: "Welcome everyone to Soul Business Solutions! Excited to have our entire team on ActionFlow.",
        },
        {
          sender: ankit,
          text: "Architecture, database sync, and workspace permissions are all operational.",
        },
        {
          sender: chirag,
          text: "Thanks Rajath and Ankit! The sprint tasks are aligned. Team, please review your assigned tasks on the board.",
        },
        {
          sender: harsha,
          text: "Looking great! I'm verifying the frontend task boards, message search, and chat responsiveness now.",
        },
        {
          sender: harsh,
          text: "All regression tests, search filters, and socket connections are green. Ready for Phase 6 release testing!",
        },
      ];

      for (const msg of generalMessages) {
        await Message.create({
          conversationId: generalGroup._id,
          workspaceId: workspace._id,
          sender: msg.sender._id,
          senderId: msg.sender._id,
          senderFirebaseUid: msg.sender.firebaseUid,
          text: msg.text,
          status: "read",
          isEdited: false,
          isDeletedForEveryone: false,
          deletedForUsers: [],
        });
      }

      generalGroup.lastMessageText = generalMessages[generalMessages.length - 1].text;
      generalGroup.lastMessageAt = new Date();
      await generalGroup.save();
    }

    // 4. Ensure Group Conversation 2: "Engineering & Product" (All 5 members)
    let engGroup = await Conversation.findOne({
      workspaceId: workspace._id,
      type: "GROUP",
      name: "Engineering & Product",
    });

    if (!engGroup) {
      engGroup = await Conversation.create({
        workspaceId: workspace._id,
        type: "GROUP",
        name: "Engineering & Product",
        description: "Sprint planning, task reviews, and technical discussions",
        createdBy: ankit._id,
        admins: [ankit._id, harsha._id],
        participants: allUserIds,
        participantIds: allUserIds,
      });
      console.log(`[SeedDemoTeam] Created group conversation: "${engGroup.name}"`);
    } else {
      engGroup.participants = allUserIds;
      engGroup.participantIds = allUserIds;
      engGroup.admins = [ankit._id, harsha._id];
      await engGroup.save();
    }

    for (const member of DEMO_TEAM_MEMBERS) {
      const u = userMap.get(member.email.toLowerCase())!;
      const isGroupAdmin = member.email === "ankit@actionflow.com" || member.email === "harsha@actionflow.com";
      await ConversationMembership.findOneAndUpdate(
        {
          conversationId: engGroup._id,
          userId: u._id,
        },
        {
          $set: {
            workspaceId: workspace._id,
            firebaseUid: u.firebaseUid,
            role: isGroupAdmin ? "GROUP_ADMIN" : "MEMBER",
            status: "ACTIVE",
          },
          $setOnInsert: {
            joinedAt: new Date(),
            unreadCount: 0,
            lastReadAt: new Date(),
          },
        },
        { upsert: true }
      );
    }

    const engMsgCount = await Message.countDocuments({ conversationId: engGroup._id });
    if (engMsgCount === 0) {
      const engMessages = [
        {
          sender: chirag,
          text: "Hey team, let's track the global search and message discovery rollouts in this channel.",
        },
        {
          sender: harsha,
          text: "Global search modal (Ctrl+K) and in-chat filtering are tested and responsive across all screens.",
        },
        {
          sender: harsh,
          text: "Verified search queries and task filters with multiple combined tags. Everything responds quickly.",
        },
        {
          sender: ankit,
          text: "Great job team. Keep an eye on the Manager Dashboard for any overdue tasks.",
        },
      ];

      for (const msg of engMessages) {
        await Message.create({
          conversationId: engGroup._id,
          workspaceId: workspace._id,
          sender: msg.sender._id,
          senderId: msg.sender._id,
          senderFirebaseUid: msg.sender.firebaseUid,
          text: msg.text,
          status: "read",
          isEdited: false,
          isDeletedForEveryone: false,
          deletedForUsers: [],
        });
      }

      engGroup.lastMessageText = engMessages[engMessages.length - 1].text;
      engGroup.lastMessageAt = new Date();
      await engGroup.save();
    }

    // 5. Ensure Direct Conversations between key pairs
    async function ensureDirectChat(userA: IUser, userB: IUser, initialMessages: { sender: IUser; text: string }[]) {
      const dmKey = getDirectDmKey(workspace!._id, userA._id, userB._id);
      let dm = await Conversation.findOne({ workspaceId: workspace!._id, dmKey });
      if (!dm) {
        dm = await Conversation.create({
          workspaceId: workspace!._id,
          type: "DIRECT",
          dmKey,
          participants: [userA._id, userB._id],
          participantIds: [userA._id, userB._id],
          createdBy: userA._id,
        });
      }

      for (const u of [userA, userB]) {
        await ConversationMembership.findOneAndUpdate(
          { conversationId: dm._id, userId: u._id },
          {
            $set: {
              workspaceId: workspace!._id,
              firebaseUid: u.firebaseUid,
              role: "MEMBER",
              status: "ACTIVE",
            },
            $setOnInsert: {
              joinedAt: new Date(),
              unreadCount: 0,
              lastReadAt: new Date(),
            },
          },
          { upsert: true }
        );
      }

      const count = await Message.countDocuments({ conversationId: dm._id });
      if (count === 0 && initialMessages.length > 0) {
        for (const msg of initialMessages) {
          await Message.create({
            conversationId: dm._id,
            workspaceId: workspace!._id,
            sender: msg.sender._id,
            senderId: msg.sender._id,
            senderFirebaseUid: msg.sender.firebaseUid,
            text: msg.text,
            status: "read",
            isEdited: false,
            isDeletedForEveryone: false,
            deletedForUsers: [],
          });
        }
        dm.lastMessageText = initialMessages[initialMessages.length - 1].text;
        dm.lastMessageAt = new Date();
        await dm.save();
      }
    }

    // Direct chats
    await ensureDirectChat(rajath, ankit, [
      { sender: rajath, text: "Hey Ankit, did you review the Phase 6 search indexes?" },
      { sender: ankit, text: "Yes Rajath, ReDoS protection and bounded limits are active. All tests are passing." },
    ]);

    await ensureDirectChat(rajath, chirag, [
      { sender: rajath, text: "Chirag, how are the manager dashboard task summaries looking?" },
      { sender: chirag, text: "Looking solid! Team workload is evenly balanced across the sprint." },
    ]);

    await ensureDirectChat(harsha, harsh, [
      { sender: harsha, text: "Harsh, could you double-check the in-chat message search scroll on mobile?" },
      { sender: harsh, text: "On it! Checked on multiple viewport widths, highlighting works smoothly." },
    ]);

    // 6. Ensure Tasks across statuses and priorities
    const tasksToEnsure = [
      {
        title: "Lead Sprint Retrospective & Manager Dashboard Review",
        description: "Analyze completed Phase 6 tasks, review team performance metrics, and prepare Phase 7 roadmap.",
        createdBy: rajath._id,
        assigneeId: harsha._id,
        priority: "HIGH" as const,
        status: "IN_PROGRESS" as const,
        dueDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), // +2 days
      },
      {
        title: "Optimize mobile viewport responsiveness for command palette",
        description: "Ensure Global Search modal keyboard navigation and category tabs render cleanly on small touchscreens.",
        createdBy: harsha._id,
        assigneeId: chirag._id,
        priority: "MEDIUM" as const,
        status: "TODO" as const,
        dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // +3 days
      },
      {
        title: "Verify cross-browser message search and real-time Socket receipts",
        description: "Validate read and delivery receipts during simultaneous in-chat message search operations.",
        createdBy: harsha._id,
        assigneeId: harsh._id,
        priority: "MEDIUM" as const,
        status: "DONE" as const,
        dueDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
        completedAt: new Date(),
      },
      {
        title: "Security audit for workspace membership RBAC and query bounds",
        description: "Ensure non-members cannot query private messages, cross-workspace tasks, or unauthorized activity feeds.",
        createdBy: rajath._id,
        assigneeId: ankit._id,
        priority: "URGENT" as const,
        status: "IN_PROGRESS" as const,
        dueDate: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000), // +1 day
      },
      {
        title: "Review Soul Business Solutions product roadmap and milestones",
        description: "Strategic executive review of product milestones and upcoming client deliverables.",
        createdBy: ankit._id,
        assigneeId: rajath._id,
        priority: "HIGH" as const,
        status: "TODO" as const,
        dueDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000), // +5 days
      },
    ];

    for (const t of tasksToEnsure) {
      const existing = await Task.findOne({
        workspaceId: workspace._id,
        title: t.title,
      });

      if (!existing) {
        await Task.create({
          workspaceId: workspace._id,
          ...t,
        });
        console.log(`[SeedDemoTeam] Created task: "${t.title}"`);
      }
    }

    // 7. Ensure notification for each user
    for (const member of DEMO_TEAM_MEMBERS) {
      const u = userMap.get(member.email.toLowerCase())!;
      const notifCount = await Notification.countDocuments({
        recipientId: u._id,
        workspaceId: workspace._id,
      });

      if (notifCount === 0) {
        await Notification.create({
          recipientId: u._id,
          workspaceId: workspace._id,
          type: "MESSAGE_RECEIVED",
          title: "Welcome to Soul Business Solutions",
          description: "You have been added to the General Team and Engineering groups on ActionFlow.",
          read: false,
          isDeleted: false,
        });
      }
    }

    console.log("[SeedDemoTeam] Soul Business Solutions demo team data ready successfully!");
  } catch (error) {
    console.error("[SeedDemoTeam] Error during initialization:", error);
  }
}
