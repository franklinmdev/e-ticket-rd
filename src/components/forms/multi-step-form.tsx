"use client";

import { ChevronLeft, ChevronRight, FileCheck } from "lucide-react";
import React, { useState, useEffect } from "react";

import { ModeToggle } from "@/components/mode-toggle";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useAppForm } from "@/components/ui/tanstack-form";
import { ValidationError } from "@/components/ui/validation-error";
import {
  applicationFormOptions,
  type ApplicationData,
  type TravelerData,
} from "@/lib/schemas/forms";
import {
  validateContactInfoData,
  validateFlightInfoData,
  validateTravelCompanionsData,
  validatePersonalInfoData,
  validateCustomsDeclarationData,
} from "@/lib/schemas/validation";
import { FORM_STEP_IDS } from "@/lib/types/form-api";
import { cn } from "@/lib/utils";

import {
  ProgressIndicator,
  useStepProgress,
  type Step,
} from "./progress-indicator";
import { AllTravelersStep } from "./steps/all-travelers-step";
import { ContactInfoStep } from "./steps/contact-info-step";
import { CustomsDeclarationStep } from "./steps/customs-declaration-step";
import { FlightInfoStep } from "./steps/flight-info-step";
import { TravelCompanionsStep } from "./steps/group-travel-step";

interface FormProps {
  onSubmit?: (data: ApplicationData) => void;
  initialData?: Partial<ApplicationData>;
  applicationCode?: string;
  className?: string;
}

// Constants for step IDs to avoid duplication - use centralized IDs
const STEP_IDS = FORM_STEP_IDS;

const STEP_TITLES = {
  TRAVEL_COMPANIONS: "Travel Companions",
  ALL_TRAVELERS_INFORMATION: "Traveler Information",
  CONTACT_INFORMATION: "Contact Information",
  TRAVEL_INFORMATION: "Travel Information",
  CUSTOMS_DECLARATION: "Customs Declaration",
} as const;

const FORM_STEPS: Step[] = [
  {
    id: STEP_IDS.CONTACT_INFO,
    title: STEP_TITLES.CONTACT_INFORMATION,
  },
  {
    id: STEP_IDS.FLIGHT_INFO,
    title: STEP_TITLES.TRAVEL_INFORMATION,
  },
  {
    id: STEP_IDS.TRAVEL_COMPANIONS,
    title: STEP_TITLES.TRAVEL_COMPANIONS,
  },
  {
    id: STEP_IDS.ALL_TRAVELERS,
    title: STEP_TITLES.ALL_TRAVELERS_INFORMATION,
  },
  {
    id: STEP_IDS.CUSTOMS_DECLARATION,
    title: STEP_TITLES.CUSTOMS_DECLARATION,
  },
];

const AUTO_SAVE_INTERVAL = 30000; // 30 seconds
const STORAGE_KEY = "eticket-draft";

export function MultiStepForm({
  onSubmit,
  initialData,
  applicationCode,
  className,
}: FormProps) {
  const [currentStepId, setCurrentStepId] = useState<string>(
    STEP_IDS.CONTACT_INFO
  );
  const [stepErrors, setStepErrors] = useState<Record<string, boolean>>({});
  const [stepValidationErrors, setStepValidationErrors] = useState<
    Record<string, unknown[]>
  >({});
  const [completedSteps, setCompletedSteps] = useState<Set<string>>(new Set());
  const [isMobile, setIsMobile] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Handle responsive design
  useEffect(() => {
    const checkIsMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };

    checkIsMobile();
    window.addEventListener("resize", checkIsMobile);
    return () => window.removeEventListener("resize", checkIsMobile);
  }, []);

  // Initialize form with TanStack Form using useAppForm hook
  const form = useAppForm({
    ...applicationFormOptions,
    defaultValues: {
      ...applicationFormOptions.defaultValues,
      ...initialData,
    },
    onSubmit: async ({ value }: { value: ApplicationData }) => {
      if (isSubmitting) return; // Prevent double submission

      setIsSubmitting(true);
      try {
        await new Promise((resolve) => setTimeout(resolve, 1000)); // Simulate API call
        onSubmit?.(value);
      } catch {
        // Handle error silently for now
      } finally {
        setIsSubmitting(false);
      }
    },
  });

  // Auto-save functionality
  useEffect(() => {
    const interval = setInterval(() => {
      const currentData = form.state.values;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(currentData));
    }, AUTO_SAVE_INTERVAL);

    return () => clearInterval(interval);
  }, [form]);

  // Load draft data on mount
  useEffect(() => {
    const savedDraft = localStorage.getItem(STORAGE_KEY);
    if (savedDraft && !initialData) {
      try {
        const draftData = JSON.parse(savedDraft) as ApplicationData;

        // Check if draft data has old phone structure and clear it
        if (
          draftData.contactInfo?.phone &&
          typeof draftData.contactInfo.phone === "object" &&
          "number" in draftData.contactInfo.phone
        ) {
          // Clear old cached data with incompatible structure
          localStorage.removeItem(STORAGE_KEY);
          return;
        }

        // Reset form with draft data
        form.reset(draftData);
      } catch {
        // Handle error silently and clear corrupted data
        localStorage.removeItem(STORAGE_KEY);
      }
    }
  }, [form, initialData]);

  // Helper function to safely get phone value as string
  const getPhoneValue = (phoneValue: unknown): string => {
    if (typeof phoneValue === "string") {
      return phoneValue.trim();
    } else if (
      phoneValue &&
      typeof phoneValue === "object" &&
      "number" in phoneValue
    ) {
      // Legacy object structure - convert to empty string to trigger re-initialization
      return "";
    }
    return "";
  };

  // Helper function to check if a step has valid data
  const isStepDataValid = (stepId: string): boolean => {
    const values = form.state.values;
    switch (stepId) {
      case STEP_IDS.CONTACT_INFO: {
        // Contact info is optional, but if user entered email or phone, it should be valid
        const hasEmail = values.contactInfo?.email?.trim();
        const hasPhone = getPhoneValue(values.contactInfo?.phone);
        return !hasEmail && !hasPhone ? true : Boolean(hasEmail || hasPhone);
      }
      case STEP_IDS.FLIGHT_INFO: {
        const flightInfo = values.flightInfo;
        const hasBasicFlightInfo = Boolean(
          flightInfo?.flightNumber &&
            flightInfo?.airline &&
            flightInfo?.departurePort
        );

        // If entering DR with connections, also check origin flight details
        const isEntryWithConnections =
          flightInfo?.travelDirection === "ENTRY" &&
          flightInfo?.hasStops === true;

        if (isEntryWithConnections) {
          const hasOriginFlightInfo = Boolean(
            flightInfo?.originFlightNumber &&
              flightInfo?.originAirline &&
              flightInfo?.originDeparturePort &&
              flightInfo?.originArrivalPort
          );
          return hasBasicFlightInfo && hasOriginFlightInfo;
        }

        return hasBasicFlightInfo;
      }
      case STEP_IDS.TRAVEL_COMPANIONS:
        return values.travelCompanions?.isGroupTravel !== undefined;
      case STEP_IDS.ALL_TRAVELERS: {
        // Check if all travelers have basic required info including address
        const hasValidTravelers = Boolean(
          values.travelers &&
            values.travelers.length > 0 &&
            values.travelers.every(
              (traveler: TravelerData) =>
                traveler.personalInfo?.firstName &&
                traveler.personalInfo?.lastName &&
                traveler.personalInfo?.passport?.number
            )
        );

        // Also check if address info is present (moved from General Info step)
        const hasValidAddresses = values.travelers?.every(
          (traveler: TravelerData) => {
            if (traveler.addressInheritance?.usesSharedAddress) {
              return true; // Shared address, no individual validation needed
            }
            const addr = traveler.addressInheritance?.individualAddress;
            return Boolean(
              addr?.permanentAddress && addr?.residenceCountry && addr?.city
            );
          }
        );

        return hasValidTravelers && hasValidAddresses;
      }
      case STEP_IDS.CUSTOMS_DECLARATION:
        return (
          typeof values.customsDeclaration?.carriesOverTenThousand ===
            "boolean" &&
          typeof values.customsDeclaration?.carriesAnimalsOrFood ===
            "boolean" &&
          typeof values.customsDeclaration?.carriesTaxableGoods === "boolean"
        );
      default:
        return false;
    }
  };

  // Step validation and progress tracking
  const steps = FORM_STEPS.map((step) => {
    // A step is completed if:
    // 1. User has explicitly completed it (tracked in completedSteps), OR
    // 2. The step has valid data AND user has moved past it
    const hasValidData = isStepDataValid(step.id);
    const userCompletedStep = completedSteps.has(step.id);
    const userMovedPastStep =
      FORM_STEPS.findIndex((s) => s.id === step.id) <
      FORM_STEPS.findIndex((s) => s.id === currentStepId);

    const isCompleted =
      userCompletedStep || (hasValidData && userMovedPastStep);
    const hasError = stepErrors[step.id] || false;

    return { ...step, isCompleted, hasError };
  });

  const stepProgress = useStepProgress(steps, currentStepId);

  // Centralized step data management
  const getCurrentStepData = () => {
    switch (currentStepId) {
      case STEP_IDS.CONTACT_INFO:
        return {
          title: STEP_TITLES.CONTACT_INFORMATION,
          subtitle:
            "Who's filling out this application? And how can we contact you?",
        };
      case STEP_IDS.FLIGHT_INFO:
        return {
          title: STEP_TITLES.TRAVEL_INFORMATION,
          subtitle: "What are your travel plans?",
        };
      case STEP_IDS.TRAVEL_COMPANIONS:
        return {
          title: STEP_TITLES.TRAVEL_COMPANIONS,
          subtitle: "Are you traveling with companions?",
        };
      case STEP_IDS.ALL_TRAVELERS:
        return {
          title: STEP_TITLES.ALL_TRAVELERS_INFORMATION,
          subtitle:
            "Personal information and address details for all travelers",
        };
      case STEP_IDS.CUSTOMS_DECLARATION:
        return {
          title: STEP_TITLES.CUSTOMS_DECLARATION,
          subtitle: "Items and goods declaration",
        };
      default:
        return {
          title: "E-Ticket Application",
          subtitle: "",
        };
    }
  };

  // Form submission will be handled directly in the submit button

  // Helper function to validate traveler data
  const validateTravelerData = async (
    travelers: TravelerData[]
  ): Promise<void> => {
    if (!travelers || travelers.length === 0) {
      throw new Error("At least one traveler is required");
    }

    for (const traveler of travelers) {
      await validatePersonalInfoData.parseAsync(traveler.personalInfo);

      // Validate address for each traveler (moved from General Info step)
      if (!traveler.addressInheritance?.usesSharedAddress) {
        // Only validate individual address if not using shared address
        const individualAddress =
          traveler.addressInheritance?.individualAddress;
        if (
          !individualAddress?.permanentAddress ||
          !individualAddress?.residenceCountry ||
          !individualAddress?.city
        ) {
          throw new Error("Address information is required for all travelers");
        }
      }
    }
  };

  // Step navigation functions
  const validateCurrentStep = async (): Promise<boolean> => {
    try {
      const values = form.state.values;
      switch (currentStepId) {
        case STEP_IDS.CONTACT_INFO:
          await validateContactInfoData.parseAsync(values.contactInfo);
          break;
        case STEP_IDS.FLIGHT_INFO:
          await validateFlightInfoData.parseAsync(values.flightInfo);
          break;
        case STEP_IDS.TRAVEL_COMPANIONS:
          await validateTravelCompanionsData.parseAsync(
            values.travelCompanions
          );
          break;
        case STEP_IDS.ALL_TRAVELERS:
          await validateTravelerData(values.travelers);
          break;
        case STEP_IDS.CUSTOMS_DECLARATION:
          await validateCustomsDeclarationData.parseAsync(
            values.customsDeclaration
          );
          break;
      }

      // Clear errors if validation passes
      setStepErrors((prev) => ({ ...prev, [currentStepId]: false }));
      setStepValidationErrors((prev) => ({ ...prev, [currentStepId]: [] }));
      return true;
    } catch (error) {
      setStepErrors((prev) => ({ ...prev, [currentStepId]: true }));

      // Extract detailed error information for user display
      const errorList: string[] = [];

      if (error && typeof error === "object" && "issues" in error) {
        // Zod validation errors
        const zodError = error as {
          issues: Array<{ message: string; path: string[] }>;
        };

        zodError.issues.forEach((issue) => {
          // Use just the message for better UX, without field path prefix
          errorList.push(issue.message);
        });

        // Log for development debugging (without exposing to user)
        if (process.env.NODE_ENV === "development") {
          // eslint-disable-next-line no-console
          console.log(
            "Validation errors for step",
            currentStepId,
            ":",
            zodError.issues
          );
        }
      } else if (error instanceof Error) {
        errorList.push(error.message);
      } else {
        errorList.push("Please check the required fields and try again");
      }

      setStepValidationErrors((prev) => ({
        ...prev,
        [currentStepId]: errorList,
      }));
      return false;
    }
  };

  const goToNextStep = async () => {
    const isValid = await validateCurrentStep();
    if (isValid && stepProgress.canGoNext && stepProgress.nextStep) {
      // Mark current step as completed when moving to next
      setCompletedSteps((prev) => new Set(prev).add(currentStepId));
      setCurrentStepId(stepProgress.nextStep.id);
    }
  };

  const goToPreviousStep = () => {
    if (stepProgress.canGoPrevious && stepProgress.previousStep) {
      setCurrentStepId(stepProgress.previousStep.id);
    }
  };

  // Render current step component
  const renderCurrentStep = () => {
    const stepProps = {
      form,
      onNext: goToNextStep,
      onPrevious: goToPreviousStep,
      stepId: currentStepId,
    };

    switch (currentStepId) {
      case STEP_IDS.CONTACT_INFO:
        return (
          <ContactInfoStep {...stepProps} stepId={STEP_IDS.CONTACT_INFO} />
        );
      case STEP_IDS.FLIGHT_INFO:
        return <FlightInfoStep {...stepProps} stepId={STEP_IDS.FLIGHT_INFO} />;
      case STEP_IDS.TRAVEL_COMPANIONS:
        return (
          <TravelCompanionsStep
            {...stepProps}
            stepId={STEP_IDS.TRAVEL_COMPANIONS}
          />
        );
      case STEP_IDS.ALL_TRAVELERS:
        return (
          <AllTravelersStep {...stepProps} stepId={STEP_IDS.ALL_TRAVELERS} />
        );
      case STEP_IDS.CUSTOMS_DECLARATION:
        return (
          <CustomsDeclarationStep
            {...stepProps}
            stepId={STEP_IDS.CUSTOMS_DECLARATION}
          />
        );
      default:
        return null;
    }
  };

  // Helper functions to safely get step data without dynamic object access
  const getStepError = (stepId: string): boolean => {
    switch (stepId) {
      case STEP_IDS.CONTACT_INFO:
        return Boolean(stepErrors[STEP_IDS.CONTACT_INFO]);
      case STEP_IDS.FLIGHT_INFO:
        return Boolean(stepErrors[STEP_IDS.FLIGHT_INFO]);
      case STEP_IDS.TRAVEL_COMPANIONS:
        return Boolean(stepErrors[STEP_IDS.TRAVEL_COMPANIONS]);
      case STEP_IDS.ALL_TRAVELERS:
        return Boolean(stepErrors[STEP_IDS.ALL_TRAVELERS]);
      case STEP_IDS.CUSTOMS_DECLARATION:
        return Boolean(stepErrors[STEP_IDS.CUSTOMS_DECLARATION]);
      default:
        return false;
    }
  };

  const getStepValidationErrors = (stepId: string): unknown[] => {
    switch (stepId) {
      case STEP_IDS.CONTACT_INFO:
        return stepValidationErrors[STEP_IDS.CONTACT_INFO] || [];
      case STEP_IDS.FLIGHT_INFO:
        return stepValidationErrors[STEP_IDS.FLIGHT_INFO] || [];
      case STEP_IDS.TRAVEL_COMPANIONS:
        return stepValidationErrors[STEP_IDS.TRAVEL_COMPANIONS] || [];
      case STEP_IDS.ALL_TRAVELERS:
        return stepValidationErrors[STEP_IDS.ALL_TRAVELERS] || [];
      case STEP_IDS.CUSTOMS_DECLARATION:
        return stepValidationErrors[STEP_IDS.CUSTOMS_DECLARATION] || [];
      default:
        return [];
    }
  };

  const isLastStep = currentStepId === STEP_IDS.CUSTOMS_DECLARATION;
  const currentStepHasErrors = getStepError(currentStepId);
  const currentStepValidationErrors = getStepValidationErrors(currentStepId);

  return (
    <form.AppForm>
      <div className={cn("bg-background min-h-screen", className)}>
        <div className="container-padding-x section-padding-y container mx-auto max-w-6xl">
          {/* Application Code Display */}
          {applicationCode && (
            <Alert className="mb-6">
              <FileCheck className="h-4 w-4" />
              <AlertDescription>
                <strong>Application Code:</strong> {applicationCode}
                <br />
                <span className="text-muted-foreground text-sm">
                  Save this code to access your application later
                </span>
              </AlertDescription>
            </Alert>
          )}

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {/* Progress Sidebar */}
            <div className="lg:col-span-1">
              <Card className="sticky top-6">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileCheck className="h-5 w-5" />
                    E-Ticket Application
                  </CardTitle>
                  <CardDescription>
                    Complete all steps to generate your e-ticket
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <ProgressIndicator
                    steps={steps}
                    currentStepId={currentStepId}
                    variant={isMobile ? "mobile" : "default"}
                  />
                </CardContent>
              </Card>
            </div>

            {/* Main Form */}
            <div className="lg:col-span-2">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-xl">
                        {getCurrentStepData().title}
                      </CardTitle>
                      <CardDescription className="mt-1">
                        {getCurrentStepData().subtitle}
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant="outline" className="text-sm">
                        {stepProgress.currentStepIndex + 1} of {steps.length}
                      </Badge>
                      <ModeToggle />
                    </div>
                  </div>
                </CardHeader>

                <Separator />

                <CardContent className="space-y-8">
                  <div id="eticket-application-form">{renderCurrentStep()}</div>
                </CardContent>

                {/* Step Validation Errors - Moved to bottom for better UX */}
                {currentStepHasErrors &&
                  currentStepValidationErrors.length > 0 && (
                    <div className="px-6 pb-6">
                      <ValidationError
                        errors={currentStepValidationErrors}
                        title="Please fix the following issues:"
                        variant="alert"
                        dismissible
                        onDismiss={() => {
                          setStepErrors((prev) => ({
                            ...prev,
                            [currentStepId]: false,
                          }));
                          setStepValidationErrors((prev) => ({
                            ...prev,
                            [currentStepId]: [],
                          }));
                        }}
                      />
                    </div>
                  )}

                <CardFooter className="flex items-center justify-between">
                  <Button
                    variant="outline"
                    onClick={goToPreviousStep}
                    disabled={!stepProgress.canGoPrevious}
                    className="gap-2"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Previous
                  </Button>

                  {isLastStep ? (
                    <Button
                      onClick={async () => {
                        if (isSubmitting) return;

                        // Only validate current step (customs declaration)
                        const isValid = await validateCurrentStep();
                        if (isValid) {
                          form.handleSubmit();
                        }
                      }}
                      disabled={
                        isSubmitting ||
                        !isStepDataValid(STEP_IDS.CUSTOMS_DECLARATION)
                      }
                      className="gap-2"
                    >
                      {isSubmitting ? "Submitting..." : "Submit Application"}
                    </Button>
                  ) : (
                    <Button
                      onClick={goToNextStep}
                      disabled={!stepProgress.canGoNext}
                      className="gap-2"
                    >
                      Next
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  )}
                </CardFooter>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </form.AppForm>
  );
}
