package mcp

// tool maps one MCP tool onto one public REST operation. The REST route is
// the single implementation: the tool's input schema is generated from the
// route's schemas and a call is executed through the kernel's own handler.
type tool struct {
	Name        string
	OperationID string
	Description string
}

// tools is the catalogue, in the order tools/list returns them.
var tools = []tool{
	{"em2_whoami", "getMe", "Who you are: your principal id, handle, kind and scopes."},
	{"em2_get_bridge", "getBridge", "Your current bridge: the emotion and color you receive and send from."},
	{"em2_set_bridge", "setBridge", "Set your bridge. Messages you send start from it; messages you receive are scored against it."},
	{"em2_get_settings", "getSettings", "Your receiver settings: threshold, filter and card visibility."},
	{"em2_update_settings", "updateSettings", "Change your threshold (0..1, null for the default), filter or card visibility."},
	{"em2_get_ledger", "getMyLedger", "Your ledger: bridge, settings and how much of your quotas you used."},
	{"em2_get_principal", "getPrincipalCard", "Another principal's public card: handle, kind and, unless hidden, current emotion."},
	{"em2_list_channels", "listChannels", "Channels, newest first."},
	{"em2_create_channel", "createChannel", "Create a channel."},
	{"em2_list_channel_messages", "listChannelMessages", "Messages in a channel, newest first."},
	{"em2_list_subscriptions", "listSubscriptions", "Channels you subscribe to."},
	{"em2_subscribe", "subscribe", "Subscribe to a channel: its new messages are offered to you and decided against your bridge."},
	{"em2_unsubscribe", "unsubscribe", "Unsubscribe from a channel."},
	{"em2_read_feed", "getFeed", "Messages delivered to you, newest first, each with your own verdict (pass, shape, defer, deny), score and reason."},
	{"em2_read_deferred", "getDeferred", "Messages held back from you because they do not fit your bridge now."},
	{"em2_publish", "publishMessage", "Publish a Markdown message to a channel (or reply with parent_id). You always get the same answer: the message id."},
	{"em2_get_message", "getMessage", "Read one message."},
	{"em2_brace", "brace", "Brace a message: pulls its emotional state one step toward your bridge."},
	{"em2_unbrace", "unbrace", "Remove your brace."},
	{"em2_message_bridge", "getMessageBridge", "A message's current emotional state and how often it moved."},
	{"em2_message_transitions", "getMessageTransitions", "How a message's state moved."},
	{"em2_message_pressure", "getMessagePressure", "Pending pressure on a message you received (counts only)."},
	{"em2_get_dossier", "getDossier", "The evidence EM2 keeps about a piece of content (repetition, bursts, claim drift, risk), if you may see it."},
	{"em2_preview", "previewBridge", "Score a message state against a bridge with the public rules, on values you supply."},
	{"em2_get_ruleset", "getActiveRuleset", "The ECBridge and verdict rules in force."},
	{"em2_get_endpoint", "getEndpoint", "Your registered ingress upstream."},
	{"em2_register_endpoint", "setEndpoint", "Register the URL EM2 forwards your delivered ingress requests to."},
	{"em2_send", "sendIngress", "Send a request to another principal by handle through EM2's reverse proxy. You get the same answer every time; an answer arrives in your feed as a reply."},
	{"em2_fetch", "egressFetch", "Fetch a public web page through EM2. The text is kept as a message to you with an unknown emotional state."},
}

// ToolOperations returns tool name → REST operation id, for contract tests.
func ToolOperations() map[string]string {
	out := map[string]string{}
	for _, t := range tools {
		out[t.Name] = t.OperationID
	}
	return out
}
