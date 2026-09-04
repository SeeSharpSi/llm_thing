var SESSION_HEADER = 'X-OpenCode-Session';

var s_conversation_session_id = null;

function randomHex(count) {
  var result = '';
  var i;

  for (i = 0; i < count; i += 1) {
    result += '0123456789abcdef'.charAt(Math.floor(Math.random() * 16));
  }

  return result;
}

function generateSessionId() {
  return randomHex(8) + '-' + randomHex(4) + '-' + randomHex(4) + '-' + randomHex(4) + '-' + randomHex(12);
}

function getConversationSessionId() {
  if (!s_conversation_session_id) {
    s_conversation_session_id = generateSessionId();
  }

  return s_conversation_session_id;
}

function rotateConversationSessionId() {
  s_conversation_session_id = generateSessionId();

  return s_conversation_session_id;
}

function endpointHost(endpoint) {
  var match;

  try {
    match = String(endpoint || '').match(/^https?:\/\/([^\/]+)/i);
    return match ? match[1].toLowerCase() : '';
  } catch (e) {
    return '';
  }
}

function isOpencodeEndpoint(endpoint) {
  var host = endpointHost(endpoint);

  return host === 'opencode.ai' || host.substring(host.length - '.opencode.ai'.length) === '.opencode.ai';
}

function applySessionHeader(request, endpoint) {
  if (!request || typeof request.setRequestHeader !== 'function') {
    return false;
  }

  if (!isOpencodeEndpoint(endpoint)) {
    return false;
  }

  request.setRequestHeader(SESSION_HEADER, getConversationSessionId());
  return true;
}

function resetForTests() {
  s_conversation_session_id = null;
}

module.exports = {
  SESSION_HEADER: SESSION_HEADER,
  getConversationSessionId: getConversationSessionId,
  rotateConversationSessionId: rotateConversationSessionId,
  isOpencodeEndpoint: isOpencodeEndpoint,
  applySessionHeader: applySessionHeader,
  resetForTests: resetForTests
};
