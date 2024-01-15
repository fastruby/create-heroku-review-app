import * as core from "@actions/core";
import * as github from "@actions/github";
import Heroku from "heroku-client/index";
const HerokuClient = require("heroku-client");

interface ReviewApp {
  pr_number: number;
  id: number;
}

interface TarballResponse {
  status: number;
  url: string;
}

async function run() {
  core.debug(JSON.stringify(github.context));

  const ctx = github.context;
  const pr = ctx.payload.pull_request!;
  const fork = pr.head.repo.fork;
  const branch = pr.head.ref;
  const version = pr.head.sha;
  const pr_number = pr.number;
  const action = core.getInput("action");
  const issue = ctx.issue;
  const pipeline = process.env.HEROKU_PIPELINE_ID;

  core.debug("connecting to heroku");
  let heroku: Heroku | undefined;

  try {
    heroku = new HerokuClient({ token: process.env.HEROKU_API_TOKEN });
  } catch (error) {
    core.error(JSON.stringify(error));
  }

  if (!heroku) {
    core.error(
      "Couldn't connect to Heroku, make sure the HEROKU_API_TOKEN is set"
    );
    return;
  }

  const destroyReviewApp = async () => {
    core.info("Fetching Review Apps list");
    try {
      const reviewApps: ReviewApp[] = await heroku!.get(
        `/pipelines/${pipeline}/review-apps`
      );

      const app = reviewApps.find((app) => app.pr_number == pr_number);
      if (app) {
        core.info("Destroying Review App");
        await heroku!.delete(`/review-apps/${app.id}`);
        core.info("Review App destroyed");
      }
    } catch (error) {
      core.error(JSON.stringify(error));
      return;
    }
  };

  const createReviewApp = async () => {
    core.debug("init octokit");
    if (!process.env.GITHUB_TOKEN) {
      core.error(
        "Couldn't connect to GitHub, make sure the GITHUB_TOKEN secret is set"
      );
      return;
    }
    const octokit = github.getOctokit(process.env.GITHUB_TOKEN);

    if (!octokit) {
      core.error(
        "Couldn't connect to GitHub, make sure the GITHUB_TOKEN is a valid token"
      );
      return;
    }

    const { url }: TarballResponse =
      await octokit.rest.repos.downloadTarballArchive({
        method: "HEAD",
        owner: issue.owner,
        repo: issue.repo,
        ref: branch,
      });

    try {
      core.info("Creating Review App");
      core.debug(
        JSON.stringify({
          branch,
          pipeline,
          source_blob: {
            url,
            version,
          },
          pr_number,
        })
      );
      const response = await heroku!.post("/review-apps", {
        body: {
          branch,
          pipeline,
          source_blob: {
            url,
            version,
          },
          pr_number,
        },
      });
      core.debug(response);
      core.info("Review App created");
    } catch (error) {
      core.error(JSON.stringify(error));
    }
  };

  switch (action) {
    case "destroy":
      destroyReviewApp();
      break;
    case "create":
      createReviewApp();
      break;
    default:
      core.debug(
        "Invalid action, no action was performed, use one of 'create' or 'destroy'"
      );
      break;
  }
}

run();
