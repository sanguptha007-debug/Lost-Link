/**
 * LostLink — Campus Assistant Script
 * Real assistant powered by AI and real Firestore search context.
 * Zero emojis, zero fake records.
 */

const chatHistory = [];

document.addEventListener('DOMContentLoaded', () => {
  LostLink.initNavToggle();
});

window.sendSuggestedPrompt = function(promptText) {
  const input = document.getElementById('chatInput');
  if (input) {
    input.value = promptText;
    handleUserMessage();
  }
};

window.handleUserMessage = async function() {
  const input = document.getElementById('chatInput');
  const stream = document.getElementById('chatStream');
  const sendBtn = document.getElementById('chatSendBtn');

  const message = input ? input.value.trim() : '';
  if (!message) return;

  appendBubble(message, 'user');
  input.value = '';
  input.focus();

  stream.scrollTop = stream.scrollHeight;

  const typingBubble = document.createElement('div');
  typingBubble.className = 'chat-bubble bubble-assistant';
  typingBubble.id = 'aiTypingIndicator';
  typingBubble.innerHTML = `<em>Searching campus records & formulating answer...</em>`;
  stream.appendChild(typingBubble);
  stream.scrollTop = stream.scrollHeight;

  LostLink.setLoading(sendBtn, true, '...');

  try {
    const res = await LostLink.api('/api/ai/assistant', {
      method: 'POST',
      body: JSON.stringify({
        message,
        history: chatHistory.slice(-6)
      })
    });

    typingBubble.remove();

    const reply = res.response || "I searched our records. You can also search directly on Find My Item or submit a report.";
    const matchingItems = res.items || [];
    appendBubble(reply, 'assistant', matchingItems);

    chatHistory.push({ role: 'user', content: message });
    chatHistory.push({ role: 'assistant', content: reply });
  } catch (err) {
    console.error('Assistant error:', err);
    typingBubble.remove();
    appendBubble("AI matching is temporarily unavailable. You can search active records directly on the Find My Item page or report an item.", 'assistant');
  } finally {
    LostLink.setLoading(sendBtn, false);
    stream.scrollTop = stream.scrollHeight;
  }
};

function appendBubble(content, role, items = []) {
  const stream = document.getElementById('chatStream');
  const bubble = document.createElement('div');
  bubble.className = `chat-bubble bubble-${role}`;

  let formatted = LostLink.sanitize(content)
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/\n\n/g, '<br><br>')
    .replace(/\n- /g, '<br>• ')
    .replace(/\n/g, '<br>');

  let itemsHtml = '';
  if (items && items.length > 0) {
    itemsHtml = `
      <div class="assistant-matched-items" style="margin-top: var(--space-3); display: flex; flex-direction: column; gap: var(--space-2);">
        <span style="font-size: var(--text-xs); font-weight: 600; color: var(--gray-700); text-transform: uppercase; letter-spacing: 0.5px;">Real Matching Reports in Database:</span>
        ${items.map(item => `
          <div class="assistant-item-card">
            ${item.imageUrl ? `
              <div class="card-image-wrap" style="width: 60px; height: 60px; flex-shrink: 0; cursor: zoom-in;" title="Click to enlarge" onclick="event.stopPropagation(); LostLink.openImageModal('${LostLink.sanitize(item.imageUrl)}', '${LostLink.sanitize(item.title)}')">
                <img src="${LostLink.sanitize(item.imageUrl)}" alt="${LostLink.sanitize(item.title)}" style="width: 100%; height: 100%; object-fit: cover; border-radius: var(--radius-sm);">
              </div>
            ` : `
              <div style="width: 60px; height: 60px; flex-shrink: 0; background: var(--gray-100); border-radius: var(--radius-sm); display: flex; align-items: center; justify-content: center; font-size: 11px; color: var(--gray-500); text-align: center;">
                No Photo
              </div>
            `}
            <div style="flex: 1; min-width: 0;">
              <strong style="display: block; font-size: var(--text-sm); color: var(--gray-900); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${LostLink.sanitize(item.title || 'Found Item')}</strong>
              <span style="display: block; font-size: var(--text-xs); color: var(--gray-600);">Location: ${LostLink.sanitize(item.location || 'Campus')}</span>
              <span style="display: block; font-size: var(--text-xs); color: var(--gray-500);">Date: ${LostLink.formatDate(item.date)}</span>
            </div>
            <div>
              <a href="item-details.html?id=${item.id}" class="btn btn-primary btn-sm" style="padding: 4px 10px; font-size: var(--text-xs);">View</a>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  bubble.innerHTML = formatted + itemsHtml;
  stream.appendChild(bubble);
  stream.scrollTop = stream.scrollHeight;
}
