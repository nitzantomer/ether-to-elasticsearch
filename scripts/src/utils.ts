export function getErrorMessage(error: any): string {
	if (error instanceof Error) {
		return error.message;
	}

	if (typeof error === "string") {
		return error;
	}

	return error.toString();
}
