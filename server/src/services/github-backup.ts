import { Octokit } from "@octokit/rest";
import { logger } from "../core/logger.js";

const log = logger.child("GitHubBackup");

interface BackupConfig {
  customerName: string;
  organizationId: string;
  environment: "dev" | "test" | "staging" | "prod";
  files: Array<{
    path: string;
    content: string;
    description?: string;
  }>;
  metadata: {
    promotedBy: string;
    promotedAt: string;
    version: string;
    configSnapshot?: any;
  };
}

export class GitHubBackupService {
  private octokit: Octokit | null = null;
  private owner: string;
  private repo: string;
  private enabled: boolean = false;

  constructor() {
    const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
    const repoUrl = process.env.GITHUB_BACKUP_REPO || process.env.GITHUB_REPOSITORY;

    if (token && repoUrl) {
      this.octokit = new Octokit({ auth: token });
      
      // Parse owner/repo from URL or direct format
      const match = repoUrl.match(/github\.com[:/]([^/]+)\/([^/.]+)/);
      if (match) {
        this.owner = match[1];
        this.repo = match[2];
        this.enabled = true;
        log.info("GitHub backup service initialized", { owner: this.owner, repo: this.repo });
      } else {
        // Try direct format: owner/repo
        const parts = repoUrl.split("/");
        if (parts.length === 2) {
          this.owner = parts[0];
          this.repo = parts[1];
          this.enabled = true;
          log.info("GitHub backup service initialized", { owner: this.owner, repo: this.repo });
        } else {
          log.warn("Invalid GITHUB_BACKUP_REPO format. Expected: owner/repo");
          this.owner = "";
          this.repo = "";
        }
      }
    } else {
      log.warn("GitHub backup disabled - GITHUB_TOKEN or GITHUB_BACKUP_REPO not configured");
      this.owner = "";
      this.repo = "";
    }
  }

  /**
   * Backup customer deployment to GitHub branch
   */
  async backupCustomerDeployment(config: BackupConfig): Promise<{
    success: boolean;
    branchName: string;
    commitSha?: string;
    url?: string;
    error?: string;
  }> {
    if (!this.enabled || !this.octokit) {
      log.warn("GitHub backup skipped - service not enabled");
      return {
        success: false,
        branchName: "",
        error: "GitHub backup service not configured",
      };
    }

    try {
      // Sanitize customer name for branch name
      const sanitizedName = this.sanitizeBranchName(config.customerName);
      const branchName = `customer/${sanitizedName}-${config.environment}`;

      log.info("Starting GitHub backup", {
        customerName: config.customerName,
        branchName,
        fileCount: config.files.length,
      });

      // Get default branch reference
      const { data: repo } = await this.octokit.repos.get({
        owner: this.owner,
        repo: this.repo,
      });
      const defaultBranch = repo.default_branch;

      // Get the latest commit SHA from default branch
      const { data: ref } = await this.octokit.git.getRef({
        owner: this.owner,
        repo: this.repo,
        ref: `heads/${defaultBranch}`,
      });
      const latestCommitSha = ref.object.sha;

      // Check if branch exists
      let branchExists = false;
      try {
        await this.octokit.git.getRef({
          owner: this.owner,
          repo: this.repo,
          ref: `heads/${branchName}`,
        });
        branchExists = true;
        log.info("Branch already exists, will update", { branchName });
      } catch (error: any) {
        if (error.status === 404) {
          log.info("Creating new branch", { branchName });
        } else {
          throw error;
        }
      }

      // Create or update branch
      if (!branchExists) {
        await this.octokit.git.createRef({
          owner: this.owner,
          repo: this.repo,
          ref: `refs/heads/${branchName}`,
          sha: latestCommitSha,
        });
      }

      // Get current tree
      const { data: baseCommit } = await this.octokit.git.getCommit({
        owner: this.owner,
        repo: this.repo,
        commit_sha: branchExists
          ? (await this.octokit.git.getRef({
              owner: this.owner,
              repo: this.repo,
              ref: `heads/${branchName}`,
            })).data.object.sha
          : latestCommitSha,
      });

      // Create blobs for all files
      const tree = await Promise.all(
        config.files.map(async (file) => {
          const { data: blob } = await this.octokit!.git.createBlob({
            owner: this.owner,
            repo: this.repo,
            content: Buffer.from(file.content).toString("base64"),
            encoding: "base64",
          });

          return {
            path: file.path,
            mode: "100644" as const,
            type: "blob" as const,
            sha: blob.sha,
          };
        })
      );

      // Add metadata file
      const metadataContent = JSON.stringify(config.metadata, null, 2);
      const { data: metadataBlob } = await this.octokit.git.createBlob({
        owner: this.owner,
        repo: this.repo,
        content: Buffer.from(metadataContent).toString("base64"),
        encoding: "base64",
      });

      tree.push({
        path: ".deployment-metadata.json",
        mode: "100644" as const,
        type: "blob" as const,
        sha: metadataBlob.sha,
      });

      // Create new tree
      const { data: newTree } = await this.octokit.git.createTree({
        owner: this.owner,
        repo: this.repo,
        base_tree: baseCommit.tree.sha,
        tree,
      });

      // Create commit
      const commitMessage = [
        `${config.environment.toUpperCase()}: ${config.customerName} deployment backup`,
        "",
        `Promoted by: ${config.metadata.promotedBy}`,
        `Version: ${config.metadata.version}`,
        `Files: ${config.files.length}`,
        `Timestamp: ${config.metadata.promotedAt}`,
      ].join("\n");

      const { data: newCommit } = await this.octokit.git.createCommit({
        owner: this.owner,
        repo: this.repo,
        message: commitMessage,
        tree: newTree.sha,
        parents: [baseCommit.sha],
      });

      // Update branch reference
      await this.octokit.git.updateRef({
        owner: this.owner,
        repo: this.repo,
        ref: `heads/${branchName}`,
        sha: newCommit.sha,
      });

      const url = `https://github.com/${this.owner}/${this.repo}/tree/${branchName}`;

      log.info("GitHub backup completed successfully", {
        branchName,
        commitSha: newCommit.sha,
        url,
      });

      return {
        success: true,
        branchName,
        commitSha: newCommit.sha,
        url,
      };
    } catch (error: any) {
      log.error("GitHub backup failed", {
        error: error.message,
        customerName: config.customerName,
      });

      return {
        success: false,
        branchName: "",
        error: error.message,
      };
    }
  }

  /**
   * List all customer backup branches
   */
  async listCustomerBackups(): Promise<Array<{
    branchName: string;
    customerName: string;
    environment: string;
    lastCommit: {
      sha: string;
      message: string;
      date: string;
      author: string;
    };
  }>> {
    if (!this.enabled || !this.octokit) {
      return [];
    }

    try {
      const { data: branches } = await this.octokit.repos.listBranches({
        owner: this.owner,
        repo: this.repo,
        per_page: 100,
      });

      const customerBranches = branches
        .filter((branch) => branch.name.startsWith("customer/"))
        .map(async (branch) => {
          const { data: commit } = await this.octokit!.repos.getCommit({
            owner: this.owner,
            repo: this.repo,
            ref: branch.commit.sha,
          });

          const [, nameEnv] = branch.name.split("customer/");
          const lastDash = nameEnv.lastIndexOf("-");
          const customerName = nameEnv.substring(0, lastDash);
          const environment = nameEnv.substring(lastDash + 1);

          return {
            branchName: branch.name,
            customerName,
            environment,
            lastCommit: {
              sha: commit.sha,
              message: commit.commit.message,
              date: commit.commit.author?.date || "",
              author: commit.commit.author?.name || "Unknown",
            },
          };
        });

      return await Promise.all(customerBranches);
    } catch (error: any) {
      log.error("Failed to list customer backups", { error: error.message });
      return [];
    }
  }

  /**
   * Get backup files from a specific branch
   */
  async getBackupFiles(branchName: string): Promise<any> {
    if (!this.enabled || !this.octokit) {
      throw new Error("GitHub backup service not configured");
    }

    try {
      const { data: tree } = await this.octokit.git.getTree({
        owner: this.owner,
        repo: this.repo,
        tree_sha: branchName,
        recursive: "true",
      });

      return tree.tree;
    } catch (error: any) {
      log.error("Failed to get backup files", { branchName, error: error.message });
      throw error;
    }
  }

  /**
   * Sanitize customer name for use in branch name
   */
  private sanitizeBranchName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
  }
}
