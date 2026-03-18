import * as core from '@actions/core'
import * as fs from 'fs'
import {Inputs, findComment} from './find'
import {inspect} from 'util'

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  return String(error)
}

async function validateSubscription(): Promise<void> {
  const eventPath = process.env.GITHUB_EVENT_PATH
  let repoPrivate: boolean | undefined

  if (eventPath && fs.existsSync(eventPath)) {
    const eventData = JSON.parse(fs.readFileSync(eventPath, 'utf8'))
    repoPrivate = eventData?.repository?.private
  }

  const upstream = 'peter-evans/find-comment'
  const action = process.env.GITHUB_ACTION_REPOSITORY
  const docsUrl =
    'https://docs.stepsecurity.io/actions/stepsecurity-maintained-actions'

  core.info('')
  core.info('\u001B[1;36mStepSecurity Maintained Action\u001B[0m')
  core.info(`Secure drop-in replacement for ${upstream}`)
  if (repoPrivate === false) {
    core.info('\u001B[32m\u2713 Free for public repositories\u001B[0m')
  }
  core.info(`\u001B[36mLearn more:\u001B[0m ${docsUrl}`)
  core.info('')

  if (repoPrivate === false) return

  const serverUrl = process.env.GITHUB_SERVER_URL || 'https://github.com'
  const body: {action: string; ghes_server?: string} = {action: action || ''}

  if (serverUrl !== 'https://github.com') {
    body.ghes_server = serverUrl
  }

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 3000)

    const response = await fetch(
      `https://agent.api.stepsecurity.io/v1/github/${process.env.GITHUB_REPOSITORY}/actions/maintained-actions-subscription`,
      {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(body),
        signal: controller.signal
      }
    )

    clearTimeout(timeoutId)

    if (response.status === 403) {
      core.error(
        '\u001B[1;31mThis action requires a StepSecurity subscription for private repositories.\u001B[0m'
      )
      core.error(
        `\u001B[31mLearn how to enable a subscription: ${docsUrl}\u001B[0m`
      )
      process.exit(1)
    }
  } catch {
    core.info('Timeout or API not reachable. Continuing to next step.')
  }
}

async function run(): Promise<void> {
  try {
    await validateSubscription()
    const inputs: Inputs = {
      token: core.getInput('token'),
      repository: core.getInput('repository'),
      issueNumber: Number(core.getInput('issue-number')),
      commentAuthor: core.getInput('comment-author'),
      bodyIncludes: core.getInput('body-includes'),
      bodyRegex: core.getInput('body-regex'),
      direction: core.getInput('direction'),
      nth: Number(core.getInput('nth'))
    }
    core.debug(`Inputs: ${inspect(inputs)}`)

    const comment = await findComment(inputs)

    if (comment) {
      core.setOutput('comment-id', comment.id.toString())
      core.setOutput('comment-node-id', comment.node_id)
      core.setOutput('comment-body', comment.body)
      core.setOutput('comment-author', comment.user ? comment.user.login : '')
      core.setOutput('comment-created-at', comment.created_at)
    } else {
      core.setOutput('comment-id', '')
      core.setOutput('comment-node-id', '')
      core.setOutput('comment-body', '')
      core.setOutput('comment-author', '')
      core.setOutput('comment-created-at', '')
    }
  } catch (error) {
    core.debug(inspect(error))
    core.setFailed(getErrorMessage(error))
  }
}

run()
