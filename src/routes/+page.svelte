<script lang="ts">
    let files: FileList | undefined;
    $: audioFile = files == undefined ? undefined : files[0];
    $: console.log(audioFile); // ** DEBUG
</script>

<h1>Transcribe!</h1>
<input type="file" accept=".mp3, .ogg, .wav" bind:files>
{#if audioFile}
    <audio controls src={URL.createObjectURL(audioFile)} />
{/if}