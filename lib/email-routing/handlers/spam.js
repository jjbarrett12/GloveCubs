/**
 * SPAM: no reply; optional mark as spam in Gmail (not implemented by default).
 */

/**
 * @returns { Promise<{ payload: object }> }
 */
async function handle() {
  return {
    draftSubject: null,
    draftBody: null,
    payload: { action: 'no_reply' },
  };
}

module.exports = { handle };
