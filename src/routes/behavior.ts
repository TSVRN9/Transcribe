// Shared with PitchgramView.svelte, which calls into the same map via a `behavior` prop
// instead of ~9 individual callback props — see +page.svelte's `behavior` map for the
// implementations (they close over playback state that lives there).
export type Behavior =
	| 'placeFlag'
	| 'pushFlagBack'
	| 'resetFlag'
	| 'rewind'
	| 'speedUp'
	| 'slowDown'
	| 'togglePlayback'
	| 'jumpBack'
	| 'jumpForward'
	| 'goToStart'
	| 'goToEnd';
